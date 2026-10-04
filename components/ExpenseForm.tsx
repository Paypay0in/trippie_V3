
import { OVERLAY } from '../constants/layers';
import { isForeignSplit, resolveExactSplit, splitTwdToEntry } from '../services/exactSplitCurrency';
import React, { useState, useEffect, useRef } from 'react';
import { Category, Phase, Expense, PaymentMethod, Companion, SplitMethod, TaxRule, TravelRules, TripMember } from '../types';
import { CATEGORIES_BY_PHASE, COMMON_CURRENCIES, PAYMENT_METHODS_CONFIG, getCategoryIcon } from '../constants';
import { CustomCategories, categoriesForPhase } from '../services/customCategories';
import { parseExpenseWithGemini, parseImageExpenseWithGemini, fetchCurrentExchangeRate } from '../services/geminiService';
import { LEGACY_OWNER_ID, describeMemberAmountConflicts, normalizeMemberIds, normalizeMemberAmountRecord, normalizeOwnerMemberId } from '../services/memberIdentity';
import { Sparkles, Loader2, Plus, X, Save, Info, Users, Divide, DollarSign, Percent, Tag, Camera, Image as ImageIcon, CalendarDays, FileText, ChevronDown, AlertTriangle } from 'lucide-react';
import { localToday } from '../services/localDate';
import { readAndDownscale } from '../services/postPhotos';
import { expenseNetAmount, refundReceivedInTwd } from '../services/viewerSpend';

interface Props {
  currentPhase: Phase;
  customCategories: CustomCategories;
  onAddCustomCategory: (phase: Phase, name: string) => void;
  onRemoveCustomCategory: (phase: Phase, name: string) => void;
  existingExpenses: Expense[];
  companions: Companion[];
  onSubmit: (expense: Omit<Expense, 'id'>, linkedItemId?: string) => void;
  onClose: () => void;
  initialCategory?: Category;
  initialData?: Expense;
  initialDescription?: string;
  initialAmount?: number; // New Prop
  initialCurrency?: string; // New Prop
  linkedItemId?: string;
  taxRule?: TaxRule | null; 
  travelRules?: TravelRules;
  ownerMemberId?: string;
  /** Display name of the trip owner, for when the viewer is someone else. */
  ownerName?: string;
  /** TripMember viewing the form; decides who gets called 我. */
  viewerMemberId?: string;
  /**
   * False when the app could not tell which member is using it.
   *
   * It used to answer "the trip owner" and say nothing, so a second traveller's
   * expenses were filed under the first one's name — the one person the ledger
   * would then say to repay. Now the record is left unattributed and the form
   * says so, because a gap gets fixed and a confident mistake does not.
   */
  viewerIdentified?: boolean;
  /**
   * Opened by someone who may not edit this record: the same form, but the
   * result is submitted as a proposal for the creator to approve rather than
   * written straight to the ledger.
   */
  proposalMode?: boolean;
  /**
   * Opens the shared delete confirmation popup for the expense being edited.
   * The form never deletes; it only asks. Omit to hide the delete entry.
   */
  onRequestDelete?: (expenseId: string) => void;
  onManageMembers?: () => void;
  onFetchTaxRule?: (currency: string) => void; 
}

const PHASE_LABELS: Record<Phase, string> = {
  pre: '旅行前',
  during: '旅行中',
  post: '返程',
  summary: '結算',
};

const ExpenseForm: React.FC<Props> = ({ 
  currentPhase,
  customCategories,
  onAddCustomCategory,
  onRemoveCustomCategory, 
  existingExpenses, 
  companions, 
  onSubmit, 
  onClose, 
  initialCategory, 
  initialData,
  initialDescription,
  initialAmount,
  initialCurrency,
  linkedItemId,
  taxRule,
  travelRules
  ,ownerMemberId, ownerName, viewerMemberId, viewerIdentified, proposalMode, onRequestDelete, onManageMembers
}) => {
  const effectiveOwnerMemberId = ownerMemberId || LEGACY_OWNER_ID;
  // Compatibility boundary: every historical owner encoding ('me', an owner id
  // from another trip id) collapses onto the active owner TripMember id, so
  // canonical state can never hold two identities for the same human.
  const normalizeMemberId = (id: string) => normalizeOwnerMemberId(id, effectiveOwnerMemberId);
  const normalizeMemberRecord = (record: Record<string, number>) =>
    normalizeMemberAmountRecord(record, effectiveOwnerMemberId);

  // Aliases of the same member are collapsed, never added together. If two
  // aliases disagree on a non-zero amount the money is ambiguous, so the form
  // reports it and refuses to save rather than persisting a guess.
  const hydratedPayerAllocations = normalizeMemberRecord(
    initialData ? (initialData.payerAllocations || { [initialData.payerId]: initialData.twdAmount }) : {}
  );
  const hydratedSplitAllocations = normalizeMemberRecord(initialData?.splitAllocations || {});
  const hydrationConflicts = [...hydratedPayerAllocations.conflicts, ...hydratedSplitAllocations.conflicts];
  const defaultCurrency = initialData?.currency || initialCurrency || (taxRule?.currency || 'TWD');
  const defaultPaymentMethod = initialData?.paymentMethod || (defaultCurrency !== 'TWD' ? PaymentMethod.CASH_FOREIGN : PaymentMethod.CASH_TWD);

  const [description, setDescription] = useState(initialData?.description || initialDescription || '');
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || (initialAmount ? initialAmount.toString() : ''));
  const [currency, setCurrency] = useState(defaultCurrency); 
  const [exchangeRate, setExchangeRate] = useState<string>(initialData?.exchangeRate.toString() || '1');
  const [handlingFee, setHandlingFee] = useState<string>(initialData?.handlingFee?.toString() || '0');
  const [category, setCategory] = useState<Category>(initialData?.category || initialCategory || CATEGORIES_BY_PHASE[currentPhase][0]);
  const [managingCategories, setManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const phaseCategories = categoriesForPhase(currentPhase, customCategories);
  const ownCategories = customCategories[currentPhase] ?? [];
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [date, setDate] = useState(initialData?.date || localToday());
  const [expenseSaveDebug, setExpenseSaveDebug] = useState({ submitClicked: false, formValid: false, validationError: '', expenseObjectCreated: false, onSubmitCalled: false });
  const [beneficiaryDebug, setBeneficiaryDebug] = useState({ clickedMemberId: '', previous: [] as string[], next: [] as string[] });
  
  // Split Bill State
  const [payerId, setPayerId] = useState(normalizeMemberId(initialData?.payerId || viewerMemberId || effectiveOwnerMemberId));
  // "我" is whoever is looking, not whoever owns the trip. Labelling the owner
  // as 我 for a different viewer makes them pick the wrong payer and the wrong
  // share — a wrong ledger entry, not just a wrong caption.
  const effectiveViewerMemberId = normalizeMemberId(viewerMemberId || effectiveOwnerMemberId);
  const viewerIsOwner = effectiveViewerMemberId === effectiveOwnerMemberId;
  // In proposal mode only the two proposable fields stay live. Leaving the
  // rest editable would let someone change a number, submit, and have it
  // silently dropped — the form would be lying about what it accepts.
  const locked = Boolean(proposalMode);
  // A disabled control that looks identical to a live one reads as broken, not
  // as locked. The dimming is what makes "you cannot change this" visible.
  const lockedStyle = locked ? ' opacity-45 grayscale cursor-not-allowed' : '';
  const ownerLabel = viewerIsOwner ? '我' : (ownerName?.trim() || '旅程擁有者');
  /** Marks the viewer's own row, whoever they are. */
  const labelForMember = (id: string, name: string) =>
    id === effectiveViewerMemberId && !viewerIsOwner ? `${name}（我）` : name;
  const memberOptions: TripMember[] = [{ id: effectiveOwnerMemberId, name: ownerLabel, type: 'owner' }, ...companions.map(c => ({ ...c, name: labelForMember(c.id, c.name), type: 'guest' as const }))];
  const [payerAllocations, setPayerAllocations] = useState<Record<string, string>>(() => {
    /*
      A new bill opens on the person entering it.

      Turning 分帳 on pre-selected the trip owner as payer whoever was holding
      the phone, so the second traveller splitting a bill she had paid saved it
      as his — the same owner assumption the unsplit path had just been taught
      not to make, and the two then disagreed with each other.
    */
    if (!initialData) return { [effectiveViewerMemberId]: '' };
    return Object.fromEntries(
      Object.entries(hydratedPayerAllocations.values).map(([id, value]) => [id, String(value)])
    );
  });
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(initialData?.splitMethod || 'EQUAL');
  const [splitEnabled, setSplitEnabled] = useState(Boolean(
    initialData && (initialData.beneficiaries.length > 1 || Object.keys(initialData.splitAllocations || {}).length > 0)
  ));
  
  // Equal Split State
  const [beneficiaries, setBeneficiaries] = useState<string[]>(() => normalizeMemberIds(
    initialData?.beneficiaries || [effectiveOwnerMemberId, ...companions.map(c => c.id)],
    effectiveOwnerMemberId
  ));
  
  // Advanced Split State (Amount/Percent)
  const [customInputs, setCustomInputs] = useState<Record<string, string>>(() => {
      const initial = { [effectiveOwnerMemberId]: '' } as Record<string, string>;
      companions.forEach(c => initial[c.id] = '');
      
      if (initialData?.splitAllocations && (initialData.splitMethod === 'EXACT' || initialData.splitMethod === 'PERCENT')) {
           /*
             Back into the currency the boxes are in.

             Stored allocations are TWD; an exact split is read and typed in the
             bill's own currency, so reopening a 28,000 KRW split must show won
             again rather than the TWD it settles in. Percentages are already
             unit-free and convert to nothing.
           */
           const toEntry = (value: number) => (initialData.splitMethod === 'EXACT'
             ? splitTwdToEntry(value, initialData.currency, initialData.exchangeRate)
             : value);
           Object.entries(hydratedSplitAllocations.values).forEach(([id, val]) => {
               initial[id] = String(Math.round(toEntry(val)));
           });
      }
      return initial;
  });

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [autoRateApplied, setAutoRateApplied] = useState(!!initialData);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Image Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Receipts kept with the expense.
   *
   * 「帳目中可以新增照片 剛點擊沒有反應」 — the button was rendered disabled, with
   * the title 照片功能尚未開放, so it read as broken rather than as absent. A
   * receipt is the evidence behind a split two people settle from; it belongs
   * beside the number.
   *
   * Downscaled in the browser, exactly as community post photos already are, so
   * a phone photo of three megabytes does not become three megabytes of row.
   */
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptPhotos, setReceiptPhotos] = useState<string[]>(initialData?.receiptPhotos || []);
  const [receiptError, setReceiptError] = useState('');
  /** A receipt opened full size, because a thumbnail cannot be read. */
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const MAX_RECEIPTS = 4;

  const handleReceiptFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReceiptError('');
    const room = MAX_RECEIPTS - receiptPhotos.length;
    if (room <= 0) {
      setReceiptError(`最多 ${MAX_RECEIPTS} 張`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    try {
      const downscaled = await Promise.all(chosen.map(readAndDownscale));
      setReceiptPhotos(current => [...current, ...downscaled]);
      if (files.length > room) setReceiptError(`最多 ${MAX_RECEIPTS} 張，其餘未加入`);
    } catch {
      setReceiptError('這張照片讀不進來，換一張試試');
    }
    if (receiptInputRef.current) receiptInputRef.current.value = '';
  };

  // Sync category if initialCategory changes prop, but only if not editing
  useEffect(() => {
    if (initialCategory && !initialData) {
        setCategory(initialCategory);
    }
  }, [initialCategory, initialData]);
  
  // Sync description if initialDescription changes (for shopping list items)
  useEffect(() => {
      if (initialDescription && !initialData) {
          setDescription(initialDescription);
      }
  }, [initialDescription, initialData]);

  // Sync amount/currency if they change and not editing
  useEffect(() => {
      if (!initialData) {
          if (initialAmount) setAmount(initialAmount.toString());
          if (initialCurrency) setCurrency(initialCurrency);
      }
  }, [initialAmount, initialCurrency, initialData]);

  // Keep beneficiaries as the single selection source. When the member list changes,
  // preserve existing choices and only add genuinely new members for a new expense.
  useEffect(() => {
      if (!initialData && companions.length > 0) {
          setBeneficiaries(prev => {
              const available = new Set([effectiveOwnerMemberId, ...companions.map(c => c.id)]);
              const existing = prev.filter(id => available.has(id));
              const added = companions.map(c => c.id).filter(id => !prev.includes(id));
              return [...existing, ...added];
          });
      }
  }, [companions.length]); 

  // Auto-set exchange rate logic
  useEffect(() => {
    if (currency === 'TWD') {
        setExchangeRate('1');
        return;
    }

    const fetchInitialRate = async () => {
        if (!autoRateApplied && !initialData) {
            // Try to find historical average for cash first
            if (paymentMethod === PaymentMethod.CASH_FOREIGN) {
                const exchanges = existingExpenses.filter(e => e.category === Category.EXCHANGE && e.currency === currency);
                if (exchanges.length > 0) {
                    const totalForeign = exchanges.reduce((acc, curr) => acc + curr.amount, 0);
                    const totalCostTwd = exchanges.reduce((acc, curr) => acc + curr.twdAmount, 0);
                    if (totalForeign > 0) {
                        setExchangeRate((totalCostTwd / totalForeign).toFixed(4));
                        setAutoRateApplied(true);
                        return;
                    }
                }
            }

            // If no historical data, fetch from Google/AI
            setIsFetchingRate(true);
            const rate = await fetchCurrentExchangeRate(currency);
            setIsFetchingRate(false);
            if (rate) {
                setExchangeRate(rate.toFixed(4));
                setAutoRateApplied(true);
            } else {
                // Fallback to constants
                const target = COMMON_CURRENCIES.find(c => c.code === currency);
                if (target) {
                    setExchangeRate(target.defaultRate.toString());
                }
            }
        }
    };

    fetchInitialRate();
  }, [currency, paymentMethod, existingExpenses, autoRateApplied, initialData]);

  // Handle AI Text Parse
  const handleAiParse = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setStatusMessage('分析中...');
    const result = await parseExpenseWithGemini(aiInput);
    setIsAiLoading(false);
    setStatusMessage('');

    if (result) {
      applyAiResult(result);
      setShowAiInput(false);
      setAiInput('');
    }
  };

  // Helper to get exchange rate synchronously for auto-save
  const getRateForAutoSave = (currencyCode: string, paymentMethod: PaymentMethod) => {
      if (currencyCode === 'TWD') return 1;
      
      // Try to find historical average for cash
      if (paymentMethod === PaymentMethod.CASH_FOREIGN) {
          const exchanges = existingExpenses.filter(e => e.category === Category.EXCHANGE && e.currency === currencyCode);
          if (exchanges.length > 0) {
              const totalForeign = exchanges.reduce((acc, curr) => acc + curr.amount, 0);
              const totalCostTwd = exchanges.reduce((acc, curr) => acc + curr.twdAmount, 0);
              if (totalForeign > 0) return totalCostTwd / totalForeign;
          }
      }
      
      // Fallback to defaults
      const target = COMMON_CURRENCIES.find(c => c.code === currencyCode);
      return target ? target.defaultRate : 1;
  };

  // Handle Image Upload & Auto-Save
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsAiLoading(true);
      setShowAiInput(true);
      setStatusMessage('正在識別並自動建立...');
      
      try {
          // Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
              const base64String = reader.result as string;
              const base64Data = base64String.split(',')[1];
              const mimeType = file.type;

              const result = await parseImageExpenseWithGemini(base64Data, mimeType);
              setIsAiLoading(false);
              setStatusMessage('');
              
              if (result && result.amount) {
                  // AUTO CREATE LOGIC
                  const parsedAmount = result.amount;
                  const parsedCurrency = result.currency?.toUpperCase() || (taxRule?.currency || 'TWD');
                  const parsedCategory = (Object.values(Category).find(c => c === result.category) as Category) || Category.OTHER;
                  const parsedPayment = (Object.values(PaymentMethod).find(p => p === result.paymentMethod) as PaymentMethod) || PaymentMethod.CASH_TWD;
                  const parsedDate = result.date || localToday();
                  
                  // Calculate Rate & TWD
                  const rate = getRateForAutoSave(parsedCurrency, parsedPayment);
                  const twdVal = parsedAmount * rate;

                  // Create Object
                  const newExpense: Omit<Expense, 'id'> = {
                      description: result.description || '未命名消費',
                      amount: parsedAmount,
                      currency: parsedCurrency,
                      category: parsedCategory,
                      paymentMethod: parsedPayment,
                      date: parsedDate,
                      exchangeRate: rate,
                      twdAmount: twdVal,
                      handlingFee: 0,
                      phase: currentPhase,
                      /*
                        The quick AI capture, filed to whoever captured it.

                        The same owner assumption as the manual save, one screen
                        over and found a day later: a photographed receipt on the
                        second traveller's phone was recorded as the owner's.
                      */
                      payerId: effectiveViewerMemberId,
                      beneficiaries: [effectiveViewerMemberId],
                      payerAllocations: { [effectiveViewerMemberId]: twdVal },
                      splitMethod: 'EQUAL',
                      splitAllocations: {},
                      needsReview: result.isUncertain
                  };

                  onSubmit(newExpense, linkedItemId);
                  onClose();
              } else {
                  alert('無法辨識圖片金額，請重試或手動輸入。');
              }
          };
          reader.onerror = () => {
              setIsAiLoading(false);
              alert('讀取圖片失敗');
          };
      } catch (err) {
          console.error(err);
          setIsAiLoading(false);
          setStatusMessage('錯誤');
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyAiResult = (result: any) => {
      if (result.description) setDescription(result.description);
      if (result.amount) setAmount(String(result.amount));
      if (result.date) setDate(result.date);
      
      if (result.currency) {
         const currencyStr = result.currency as string;
         const foundCurr = COMMON_CURRENCIES.find(c => c.code === currencyStr.toUpperCase())?.code || currencyStr.toUpperCase();
         setCurrency(foundCurr);
         setAutoRateApplied(false); 
      }
      if (result.category) {
        const matchedCat = Object.values(Category).find(c => c === result.category) as Category;
        if (matchedCat) {
            setCategory(matchedCat);
        }
      }
      if (result.paymentMethod) {
        const matchedMethod = Object.values(PaymentMethod).find(p => p === result.paymentMethod) as PaymentMethod;
        if (matchedMethod) {
            setPaymentMethod(matchedMethod);
        }
      }
  };

  const handleCurrencyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newCurrency = e.target.value;
      setCurrency(newCurrency);
      setAutoRateApplied(false);
      
      if (newCurrency !== 'TWD') {
          if (paymentMethod === PaymentMethod.CASH_TWD) {
              setPaymentMethod(PaymentMethod.CASH_FOREIGN);
          }
          
          // Auto-fetch current rate from AI/Google.
          //
          // Falling through without setting anything leaves the rate at the
          // previous currency's value — switching TWD to KRW and losing the
          // lookup would record every won at 1:1 and quietly wreck the whole
          // ledger. A stored rate is stale; the old currency's rate is wrong.
          setIsFetchingRate(true);
          const rate = await fetchCurrentExchangeRate(newCurrency);
          setIsFetchingRate(false);
          if (rate) {
              setExchangeRate(rate.toFixed(4));
              setAutoRateApplied(true);
          } else {
              const target = COMMON_CURRENCIES.find(c => c.code === newCurrency);
              if (target) setExchangeRate(target.defaultRate.toString());
          }
      } else {
          if (paymentMethod === PaymentMethod.CASH_FOREIGN) {
              setPaymentMethod(PaymentMethod.CASH_TWD);
          }
          setExchangeRate('1');
      }
  };

  const handleRefreshRate = async () => {
      if (currency === 'TWD') return;
      setIsFetchingRate(true);
      const rate = await fetchCurrentExchangeRate(currency);
      setIsFetchingRate(false);
      if (rate) {
          setExchangeRate(rate.toFixed(4));
          setAutoRateApplied(true);
      } else {
          // Keep the rate already on screen — it is the traveller's, or a
          // stored default, and either beats blanking it. But say so: a
          // refresh button that does nothing visible reads as "refreshed".
          setStatusMessage('查不到即時匯率，沿用目前的匯率。');
          window.setTimeout(() => setStatusMessage(''), 3000);
      }
  };

  const toggleBeneficiary = (id: string) => {
    setBeneficiaries(previous => {
      const canonicalId = normalizeMemberId(id);
      const next = previous.includes(canonicalId)
        ? (previous.length > 1 ? previous.filter(b => b !== canonicalId) : previous)
        : normalizeMemberIds([...previous, canonicalId], effectiveOwnerMemberId);
      setBeneficiaryDebug({ clickedMemberId: id, previous, next });
      if (next.length !== previous.length) {
        setCustomInputs(inputs => Object.fromEntries(Object.entries(inputs).filter(([memberId]) => next.includes(memberId))));
      }
      return next;
    });
  };

  const handleCustomInputChange = (id: string, value: string) => {
      setCustomInputs(prev => ({ ...prev, [id]: value }));
  };

  const currentTotalTwd = (parseFloat(amount || '0') * parseFloat(exchangeRate || '1')) + (category === Category.EXCHANGE ? parseFloat(handlingFee || '0') : 0);

  /*
    An exact split is entered in the currency the bill was paid in.

    「該筆帳的金額是用韓幣計價 但是分帳的時候只能顯示用台幣分帳 是錯誤的」. The boxes
    were labelled TWD and held TWD, so splitting a 28,000 KRW dinner meant
    converting it in your head first — and the number a traveller actually has
    is 「她那份一萬韓元」, read off the bill in front of them.

    Stored in TWD regardless, because that is what the ledger settles in; the
    conversion happens here, with the rate already on this form.
  */
  const splitCurrency = (currency || 'TWD').toUpperCase();
  const splitRate = parseFloat(exchangeRate || '1');
  /** The bill, in its own currency: what the exact boxes add up to. */
  const currentTotalEntry = isForeignSplit(splitCurrency, splitRate)
    ? (parseFloat(amount || '0') || 0)
    : currentTotalTwd;

  const exactLastBeneficiaryId = splitMethod === 'EXACT' && beneficiaries.length > 0
      ? beneficiaries[beneficiaries.length - 1]
      : undefined;

  const getExactManualTotal = () => beneficiaries
      .filter(id => id !== exactLastBeneficiaryId)
      .reduce((sum, id) => sum + Math.max(0, parseFloat(customInputs[id] || '0') || 0), 0);

  const exactRemainder = splitMethod === 'EXACT'
      ? Math.max(0, currentTotalEntry - getExactManualTotal())
      : 0;

  const exactAllocationExceedsTotal = splitMethod === 'EXACT' && getExactManualTotal() > currentTotalEntry + 0.0001;
  const percentLastBeneficiaryId = splitMethod === 'PERCENT' && beneficiaries.length > 0
      ? beneficiaries[beneficiaries.length - 1]
      : undefined;
  const getPercentManualTotal = () => beneficiaries
      .filter(id => id !== percentLastBeneficiaryId)
      .reduce((sum, id) => sum + Math.max(0, parseFloat(customInputs[id] || '0') || 0), 0);
  const percentRemainder = splitMethod === 'PERCENT'
      ? Math.max(0, 100 - getPercentManualTotal())
      : 0;
  const percentAllocationExceedsTotal = splitMethod === 'PERCENT' && getPercentManualTotal() > 100.0001;
  const payerIds = Object.keys(payerAllocations).filter(id => memberOptions.some(m => m.id === id));
  /*
    Who put the money down, derived rather than entered.

    The ledger holds three facts — who recorded it, who paid, who shares it —
    and an amount-per-payer map restates the second of them. A restatement can
    disagree with the fact it restates, and did: a payer corrected to the second
    traveller left the map reading {owner: 888}, so her own spending counted
    against his budget while every field anyone inspected named her.
  */
  const resolvedPayerAllocations = { [payerIds[0] || effectiveViewerMemberId]: currentTotalTwd };
  const payerAllocationExceedsTotal = false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseSaveDebug(current => ({ ...current, submitClicked: true, formValid: false, validationError: '', expenseObjectCreated: false, onSubmitCalled: false }));
    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
        setExpenseSaveDebug(current => ({ ...current, validationError: '項目名稱不可為空' }));
        return;
    }
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setExpenseSaveDebug(current => ({ ...current, validationError: '金額必須大於 0' }));
        return;
    }
    if (!date) {
        setExpenseSaveDebug(current => ({ ...current, validationError: '日期不可為空' }));
        return;
    }
    if (hydrationConflicts.length > 0) {
        setExpenseSaveDebug(current => ({
          ...current,
          validationError: `同一成員存在衝突的分帳金額，請重新確認：${describeMemberAmountConflicts(hydrationConflicts)}`,
        }));
        return;
    }

    const rate = parseFloat(exchangeRate);
    const amt = parseFloat(amount);
    const fee = parseFloat(handlingFee || '0');
    
    let totalTwd = amt * rate;
    if (category === Category.EXCHANGE) {
      totalTwd += fee;
    }

    let finalAllocations: Record<string, number> = {};
    
    if (splitEnabled && splitMethod === 'EXACT') {
        /*
          Typed in the bill's currency, stored in TWD.

          The arithmetic lives in exactSplitCurrency rather than here: it decides
          who owes what, and that is worth being testable on its own.
        */
        const typed: Record<string, number> = {};
        beneficiaries.forEach(id => { typed[id] = parseFloat(customInputs[id] || '0') || 0; });
        const exact = resolveExactSplit({
            amount: parseFloat(amount || '0') || 0,
            currency,
            exchangeRate: rate,
            totalTwd,
            typed,
            remainderMemberId: exactLastBeneficiaryId,
        });

        if (exact.exceedsTotal) {
            alert('分攤金額超過支出總額');
            return;
        }

        finalAllocations = exact.allocations;
    } else if (splitEnabled && splitMethod === 'PERCENT') {
        const manualPercent = beneficiaries
            .filter(id => id !== percentLastBeneficiaryId)
            .reduce((sum, id) => {
                const value = Math.max(0, parseFloat(customInputs[id] || '0') || 0);
                if (value > 0) finalAllocations[id] = (totalTwd * value) / 100;
                return sum + value;
            }, 0);

        if (manualPercent > 100.0001) {
             alert('分攤比例超過 100%');
             return;
        }

        if (percentLastBeneficiaryId) {
            finalAllocations[percentLastBeneficiaryId] = (totalTwd * Math.max(0, 100 - manualPercent)) / 100;
        }
    }

    const submittedPayerAllocations = normalizeMemberRecord(resolvedPayerAllocations);
    const submittedSplitAllocations = normalizeMemberRecord(finalAllocations);
    const submitConflicts = [...submittedPayerAllocations.conflicts, ...submittedSplitAllocations.conflicts];
    if (splitEnabled && submitConflicts.length > 0) {
        setExpenseSaveDebug(current => ({
          ...current,
          validationError: `同一成員存在衝突的分帳金額，請重新確認：${describeMemberAmountConflicts(submitConflicts)}`,
        }));
        return;
    }

    const nextExpense = {
      description,
      amount: amt,
      currency,
      exchangeRate: rate,
      handlingFee: category === Category.EXCHANGE ? fee : 0,
      twdAmount: totalTwd,
      category,
      paymentMethod,
      phase: initialData ? initialData.phase : currentPhase,
      date,
      // Saved state is canonical-only: no legacy 'me', no foreign owner id.
      /*
        A bill with no split is the recorder's own, not the trip owner's.

        Both of these named the owner outright, so every expense the second
        traveller entered on her own phone was filed and prepaid in his name —
        the same owner-assumption that put 888 of hers in his total, hiding one
        field deeper. 「誰付款的、誰分擔」 is answered by whoever is holding the
        phone when nobody says otherwise.
      */
      payerId: normalizeMemberId(splitEnabled ? (payerIds[0] || payerId) : effectiveViewerMemberId),
      payerAllocations: { [normalizeMemberId(splitEnabled ? (payerIds[0] || payerId) : effectiveViewerMemberId)]: totalTwd },
      beneficiaries: splitEnabled
        ? normalizeMemberIds(beneficiaries, effectiveOwnerMemberId)
        : [effectiveViewerMemberId],
      splitMethod: splitEnabled ? splitMethod : 'EQUAL',
      splitAllocations: splitEnabled ? submittedSplitAllocations.values : {},
      receiptPhotos,
      needsReview: false // Manual entry assumes review is done
    };
    setExpenseSaveDebug(current => ({ ...current, formValid: true, expenseObjectCreated: true, onSubmitCalled: true }));
    onSubmit(nextExpense, linkedItemId);
    onClose();
  };

  const isExchange = category === Category.EXCHANGE;
  const isEditing = !!initialData;
  const getRemaining = () => {
      if (splitMethod === 'EXACT') {
          return exactRemainder;
      }
      let sum = 0;
      Object.values(customInputs).forEach(val => {
          sum += parseFloat((val as string) || '0');
      });
      if (splitMethod === 'PERCENT') {
          return 100 - sum;
      }
      return 0;
  };

  // Tax Refund Calculation Logic
  /*
    Shopping only, like every other refund screen.

    The estimate, the list and the 不可退稅 mark all filter on 購物, because a
    meal is not refundable however much it cost. Without the same filter here a
    40,000 KRW dinner was told it qualified — which is the opposite of helpful
    beside a number somebody is deciding whether to queue for.
  */
  const isEligibleForRefund = taxRule
                              && taxRule.refundRate > 0
                              && currentPhase === 'during'
                              && category === Category.SHOPPING
                              && parseFloat(amount || '0') >= taxRule.minSpend
                              && (currency.toUpperCase() === taxRule.currency.toUpperCase()); 

  const estimatedRefund = isEligibleForRefund ? parseFloat(amount || '0') * taxRule.refundRate : 0;
  const taxRefundGuidance = category === Category.SHOPPING ? travelRules?.taxRefund : undefined;

  // Section heading shared by the three form groups, so the grouping reads as
  // one system rather than three ad-hoc labels.
  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 pt-1">
      <span className="h-4 w-1 rounded-full bg-violet-500" />
      <span className="text-sm font-black tracking-tight text-[#11183d]">{children}</span>
    </div>
  );

  // Read-only context for the record being edited. It renders the stored
  // expense, not the live form state, so it stays a stable reference point
  // while the fields below are being changed.
  const SummaryIcon = initialData ? getCategoryIcon(initialData.category) : null;

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 ${OVERLAY.form} animate-fade-in`}>
      {/* A receipt at a size it can actually be read at. */}
      {viewingReceipt && (
        <div
          role="dialog"
          aria-label="收據"
          data-testid="receipt-viewer"
          onClick={() => setViewingReceipt(null)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img src={viewingReceipt} alt="收據" className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            aria-label="關閉收據"
            onClick={() => setViewingReceipt(null)}
            className="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white"
          >
            <X size={20} />
          </button>
        </div>
      )}
      <div className="bg-white rounded-[28px] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white flex-shrink-0">
          <button onClick={onClose} aria-label="關閉" className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500">
            <X size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-[#11183d]">
               {proposalMode
                  ? '提出修正建議'
                  : isEditing
                    ? '編輯支出'
                    : isExchange ? '新增換匯紀錄' : '新增支出'
               }
            </h2>
            {/* Which part of the ledger this will land in. The categories on
                offer come from it, so when it is wrong — and it has been — the
                form looks broken for no visible reason. */}
            {!proposalMode && !isEditing && (
              <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                記入{PHASE_LABELS[currentPhase]}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-5 space-y-5 overflow-y-auto flex-1">
            {/*
              Said out loud rather than guessed. Until this, an unidentified
              viewer was quietly treated as the trip owner and their expenses
              were filed under that name — on a shared ledger, under the name of
              the person everyone else would then be told to repay.
            */}
            {viewerIdentified === false && !isEditing && (
              <div data-testid="viewer-unidentified" className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[11px] font-bold leading-5 text-amber-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  目前無法確認你是這趟旅程的哪一位成員，這筆支出不會標記建立者。請稍後在旅伴名單確認你的帳號後補上。
                </span>
              </div>
            )}
            {/* Hidden File Input */}
            <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleImageUpload}
            />

            {!showAiInput ? (
               <div className="hidden">
                   <button 
                     type="button"
                     onClick={() => setShowAiInput(true)}
                     className="flex-1 py-2 bg-gradient-to-r from-purple-50 to-blue-50 text-purple-700 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-purple-200 hover:from-purple-100 hover:to-blue-100 transition-colors"
                   >
                     <Sparkles size={16} /> AI 語音/文字輸入
                   </button>
                   <button 
                     type="button"
                     onClick={() => fileInputRef.current?.click()}
                     className="px-4 py-2 bg-white text-gray-600 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
                     title="上傳收據或訂單截圖"
                   >
                     <ImageIcon size={18} />
                   </button>
               </div>
            ) : (
              <div className="hidden">
                <input 
                  type="text" 
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder={isAiLoading ? statusMessage || "正在分析中..." : "輸入文字... (e.g., 刷卡買機票 15000)"}
                  className="flex-1 border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleAiParse()}
                  disabled={isAiLoading}
                />
                <button 
                  type="button"
                  onClick={handleAiParse}
                  disabled={isAiLoading}
                  className="bg-purple-600 text-white px-4 rounded-lg flex items-center justify-center disabled:opacity-50"
                >
                  {isAiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                </button>
              </div>
            )}

            {taxRefundGuidance && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-3 text-sm text-slate-700">
                <div className="font-bold text-violet-900">購物退稅提醒</div>
                <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">{taxRefundGuidance.guidance.split('\n').slice(0, 3).join('\n')}</p>
                <p className="mt-2 text-[11px] text-slate-500">資格仍取決於居住地與官方/當地規定；目前未提供居住地，因此不判定是否符合資格。</p>
              </div>
            )}
            
            {isAiLoading && (
              <div className="text-center text-xs text-purple-600 animate-pulse">
                  {statusMessage}
              </div>
            )}
            
            {/* Only show manual form if not in middle of image auto-save */}
            {(!isAiLoading || statusMessage === '分析中...') && (
            <div className="space-y-5 pt-0">
              {initialData && SummaryIcon && (
                <div className="flex items-center gap-3 rounded-2xl bg-[#f5f1ff] p-4 ring-1 ring-violet-100">
                  {/*
                    The receipt, where the category icon would otherwise sit.

                    「如果用戶有上傳照片，將帳目照片放在此欄位顯示」 — a bill you are
                    checking is recognised by the picture of it long before the
                    words, and the picture was already attached to this record.
                  */}
                  {receiptPhotos.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setViewingReceipt(receiptPhotos[0])}
                      aria-label="放大收據"
                      data-testid="summary-receipt"
                      className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full shadow-sm ring-1 ring-violet-100"
                    >
                      <img src={receiptPhotos[0]} alt="收據" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
                      <SummaryIcon size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#11183d]">
                      {initialData.description || '這筆支出'}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      {initialData.date.replace(/-/g, '/')}
                    </div>
                  </div>
                  <div className="flex-shrink-0 whitespace-nowrap text-base font-black text-[#11183d]">
                    NT$ {Math.round(initialData.twdAmount).toLocaleString()}
                  </div>
                </div>
              )}

              {proposalMode && (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-900 ring-1 ring-amber-100">
                  這筆帳由其他旅伴建立。你可以提議修改<b className="font-black">金額</b>、<b className="font-black">分攤成員</b>與<b className="font-black">分帳方式與金額</b>，送出後由建立者核准。
                </p>
              )}

              {!locked && <SectionHeading>基本資訊</SectionHeading>}

              {!locked && (
                <div>
                  <label className="block text-sm font-bold text-[#11183d] mb-2">項目名稱 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input 
                      required
                      type="text"
                      value={description}
                      disabled={locked}
                      onChange={e => setDescription(e.target.value)}
                      className={`w-full h-12 border border-slate-200 rounded-2xl px-4 pr-11 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none${lockedStyle}`}
                      placeholder="例如：東京地鐵三日券"
                    />
                    <FileText size={17} className="pointer-events-none absolute right-4 top-3.5 text-slate-300" />
                  </div>
                </div>
              )}

              {!locked && (
                <div>
                   <div className="mb-2 flex items-center justify-between">
                     <label className="block text-sm font-bold text-[#11183d]">分類 <span className="text-red-500">*</span></label>
                     <button type="button" onClick={() => setManagingCategories(current => !current)} className="text-xs font-bold text-violet-600">{managingCategories ? '完成' : '自訂分類管理 >'}</button>
                   </div>
                   {managingCategories && (
                     /* Adding and removing happen here rather than on the
                        picker itself: a delete button on every category would
                        sit under the thumb of someone who only meant to choose
                        one. */
                     <div className="mb-3 rounded-2xl bg-slate-50 p-3">
                       <div className="flex gap-2">
                         <input
                           value={newCategoryName}
                           onChange={event => setNewCategoryName(event.target.value)}
                           onKeyDown={event => {
                             if (event.key === 'Enter') {
                               event.preventDefault();
                               onAddCustomCategory(currentPhase, newCategoryName);
                               setNewCategoryName('');
                             }
                           }}
                           maxLength={12}
                           placeholder="新增分類（例如：溫泉）"
                           className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300"
                         />
                         <button
                           type="button"
                           onClick={() => { onAddCustomCategory(currentPhase, newCategoryName); setNewCategoryName(''); }}
                           disabled={!newCategoryName.trim()}
                           className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-black text-white disabled:opacity-40"
                         >新增</button>
                       </div>
                       {ownCategories.length > 0 ? (
                         <div className="mt-2.5 flex flex-wrap gap-2">
                           {ownCategories.map(name => (
                             <span key={name} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                               {name}
                               <button type="button" aria-label={`刪除分類：${name}`} onClick={() => onRemoveCustomCategory(currentPhase, name)} className="text-slate-400">
                                 <X size={13} />
                               </button>
                             </span>
                           ))}
                         </div>
                       ) : (
                         <p className="mt-2.5 text-xs text-slate-400">這個階段還沒有自訂分類。刪除分類不會影響已經記錄的支出。</p>
                       )}
                     </div>
                   )}
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                     {phaseCategories.map(cat => (
                       <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        disabled={locked}
                          className={`text-xs min-h-11 py-2 px-1 rounded-xl border transition-colors${lockedStyle} ${
                          category === cat
                            ? 'bg-violet-50 text-violet-700 border-violet-500'
                            : 'bg-white text-gray-600 border-slate-200 hover:bg-slate-50'
                        }`}
                       >
                         {cat}
                       </button>
                     ))}
                   </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)] gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#11183d] mb-2">金額 <span className="text-red-500">*</span></label>
                  <div className="flex h-12 rounded-2xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-400">
                    <select value={currency} disabled={locked} onChange={handleCurrencyChange} className={`w-[29%] min-w-[4.25rem] border-r border-slate-200 px-2 sm:px-3 outline-none bg-white text-sm font-bold text-[#11183d]${lockedStyle}`}>
                      {COMMON_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                      {taxRule && !COMMON_CURRENCIES.some(c => c.code === taxRule.currency) && <option value={taxRule.currency}>{taxRule.currency}</option>}
                    </select>
                    <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="min-w-0 flex-1 px-4 outline-none font-mono text-base" placeholder="500" />
                  </div>
                  {/*
                    The rate belongs under the amount it converts.

                    「匯率欄位要放在金額下面 才會直觀」 — it sat three sections lower,
                    inside 付款資訊, so entering 150000 KRW and reading what that
                    costs in TWD meant scrolling past the split settings and the
                    payment method to find the number doing the work.
                  */}
              {!locked && currency !== 'TWD' && (
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-orange-700 flex items-center gap-1">
                          匯率 (1 {currency} = ? TWD)
                          <button 
                            type="button" 
                            onClick={handleRefreshRate}
                            disabled={isFetchingRate}
                            className="ml-1 px-2 py-1 hover:bg-orange-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 border border-orange-200 bg-white shadow-sm"
                            title="使用 AI 抓取最新匯率"
                          >
                            {isFetchingRate ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span className="text-[10px] font-bold whitespace-nowrap">
                              {localToday().replace(/-/g, '/')} Google 當日匯率
                            </span>
                          </button>
                      </label>
                      <input 
                        type="number" 
                        step="0.0001"
                        value={exchangeRate}
                        disabled={locked}
                        onChange={e => {
                            setExchangeRate(e.target.value);
                            setAutoRateApplied(true);
                        }}
                        className="w-24 border border-orange-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-orange-500 outline-none text-right"
                      />
                    </div>
                    
                    {isExchange && (
                      <div className="flex items-center justify-between border-t border-orange-200 pt-2">
                        <label className="text-xs font-medium text-orange-700">手續費 (TWD)</label>
                        <input 
                          type="number" 
                          step="1"
                          value={handlingFee}
                          disabled={locked}
                          onChange={e => setHandlingFee(e.target.value)}
                          className="w-24 border border-orange-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-orange-500 outline-none text-right"
                          placeholder="0"
                        />
                      </div>
                    )}
                    
                    <div className="text-right text-xs text-gray-500 pt-1 border-t border-orange-200 mt-2">
                      成本計算: <span className="font-mono font-bold text-orange-800 text-sm">
                        {Math.round(currentTotalTwd).toLocaleString()}
                      </span> TWD
                    </div>
                  </div>
              )}
                </div>
                {!locked && (
                  <div>
                    <label className="block text-sm font-bold text-[#11183d] mb-2">日期 <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <CalendarDays size={17} className="absolute left-3 top-2.5 text-slate-500" />
                      <input type="date" value={date} disabled={locked} onChange={e => setDate(e.target.value)} className={`w-full h-12 border border-slate-200 rounded-2xl pl-10 pr-8 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none bg-white text-sm whitespace-nowrap${lockedStyle}`} />
                      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Tax Refund Alert */}
              {/*
                The refund already taken off this bill, shown as the subtraction.

                「若是在結帳時已退稅，要回頭去去掉該筆帳的總額。點開可看到計算」 —
                the list row shows the net figure, and this is where the three
                numbers behind it are: what the shop charged, what came back,
                and what it therefore cost. A number nobody can reconstruct is a
                number nobody can check against their card bill.
              */}
              {initialData && refundReceivedInTwd(initialData) > 0 && (
                  <div data-testid="refund-breakdown" className="animate-fade-in rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                      <div className="text-sm font-bold text-emerald-800">
                          {initialData.taxRefundedAtPurchase ? '結帳時已退稅' : '已收到退稅'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-emerald-900">
                          <div className="flex justify-between">
                              <span>原始金額</span>
                              <span className="font-mono">NT$ {Math.round(initialData.twdAmount).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                              <span>
                                  已退稅
                                  {initialData.currency !== 'TWD' && initialData.taxRefundActual !== undefined && (
                                      <span className="ml-1 text-emerald-700/70">
                                          （{Math.round(initialData.taxRefundActual).toLocaleString()} {initialData.currency}）
                                      </span>
                                  )}
                              </span>
                              <span className="font-mono">− NT$ {Math.round(refundReceivedInTwd(initialData)).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-emerald-200 pt-1 font-bold">
                              <span>實際支出</span>
                              <span className="font-mono">NT$ {Math.round(expenseNetAmount(initialData)).toLocaleString()}</span>
                          </div>
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-emerald-700/70">
                          各項總計與分帳都以「實際支出」計算。退稅金額可在退稅清單裡修改。
                      </p>
                  </div>
              )}

              {isEligibleForRefund && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 animate-fade-in shadow-sm">
                      <div className="flex items-start gap-3">
                          <div className="bg-amber-100 p-1.5 rounded-full">
                              <Tag className="text-amber-600" size={16} />
                          </div>
                          <div>
                              <div className="font-bold text-amber-800 text-sm">💡 符合 {taxRule.country} 退稅資格！</div>
                              <div className="text-xs text-amber-700 mt-1">
                                  該國退稅門檻為 {taxRule.minSpend.toLocaleString()} {taxRule.currency}。
                                  <br/>
                                  預估可退約 <span className="font-bold text-amber-800">{estimatedRefund.toLocaleString()} {taxRule.currency}</span>。
                              </div>
                              <div className="text-[10px] text-amber-600 mt-1 italic">
                                  * {taxRule.notes}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {!isExchange && <SectionHeading>分帳設定</SectionHeading>}

              {!isExchange && (
                  <div className="rounded-2xl border border-violet-100 bg-[#f5f1ff] p-4 space-y-4">
                      {!locked && (
                        <button type="button" disabled={locked} onClick={() => setSplitEnabled(value => !value)} className={`w-full flex items-center justify-between text-left${lockedStyle}`}>
                          <span className="flex items-center gap-3"><Users size={21} className="text-violet-600" /><span><span className="block text-sm font-bold text-[#11183d]">此筆支出需要分帳</span><span className="block text-xs text-slate-500 mt-0.5">開啟後可選擇分帳方式與分攤成員</span></span></span>
                          <span className={`relative h-7 w-12 rounded-full transition-colors ${splitEnabled ? 'bg-violet-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${splitEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></span>
                        </button>
                      )}
                  {splitEnabled && <div className="space-y-5 border-t border-violet-200/70 pt-4">
                      <div className="flex items-center justify-between pb-1">
                           <div className="flex items-center gap-2 text-[#11183d]">
                              <Users size={16} />
                              <span className="text-sm font-bold">分帳設定</span>
                           </div>
                  <button type="button" onClick={onManageMembers} className="text-xs font-bold text-violet-600">調整成員 &gt;</button>
                      </div>
                      {!locked && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">1</span><div><div className="text-sm font-bold text-[#11183d]">付款者</div><div className="text-[11px] text-slate-500">選擇實際付款的人</div></div></div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {memberOptions.map(member => {
                            const selected = payerIds.includes(member.id);
                            return <label key={member.id} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 transition-colors${lockedStyle} ${selected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                              {/* One payer, always. 「誰付款 與 誰分擔 這件事本身
                                  就已經做完墊付這件事了」 — two people each putting
                                  money down is two bills, and a second way to say
                                  who paid is a second thing to go stale. */}
                              <input type="radio" name="expense-payer" checked={selected} disabled={locked} onChange={() => setPayerAllocations({ [member.id]: '' })} />
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{member.name.charAt(0)}</span>
                              <span className="flex-1 truncate text-xs font-bold text-[#11183d]">{member.name}</span>
                            </label>;
                          })}
                          </div>
                        </div>
                      )}

                      {(
                          <div>
                              <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">2</span><div><div className="text-sm font-bold text-[#11183d]">分給誰（{beneficiaries.length} 人）</div><div className="text-[11px] text-slate-500">選擇需要分攤此筆支出的人</div></div></div><button type="button" onClick={onManageMembers} className="text-xs font-bold text-violet-600">調整成員 &gt;</button></div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <button
                                      type="button"
                                      onClick={() => toggleBeneficiary(effectiveOwnerMemberId)}
                                      className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${beneficiaries.includes(effectiveOwnerMemberId) ? 'bg-violet-50 text-violet-700 border-violet-400' : 'bg-white text-gray-500 border-slate-200'}`}
                                  >
                                      <input type="checkbox" readOnly checked={beneficiaries.includes(effectiveOwnerMemberId)} className="accent-violet-600" aria-label={`選擇${ownerLabel}`} />
                                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${beneficiaries.includes(effectiveOwnerMemberId) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{ownerLabel.charAt(0)}</span>{ownerLabel}
                                  </button>
                                  {companions.map(c => (
                                      <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => toggleBeneficiary(c.id)}
                                          className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${beneficiaries.includes(c.id) ? 'bg-violet-50 text-violet-700 border-violet-400' : 'bg-white text-gray-500 border-slate-200'}`}
                                      >
                                          <input type="checkbox" readOnly checked={beneficiaries.includes(c.id)} className="accent-violet-600" aria-label={`選擇${labelForMember(c.id, c.name)}`} />
                                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${beneficiaries.includes(c.id) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.name.charAt(0)}</span>{c.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {import.meta.env.DEV && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-[10px] text-amber-900">
                        <div className="font-bold">BENEFICIARY DEBUG</div>
                        <div>createdByMemberId: {initialData?.createdByMemberId || 'none (legacy)'}</div>
                        <div>viewerMemberId: {effectiveViewerMemberId}</div>
                        <div>proposalMode: {proposalMode ? 'YES' : 'NO'}</div>
                        <div>ownerMemberId: {effectiveOwnerMemberId}</div>
                        <div>amountConflicts: {hydrationConflicts.length ? describeMemberAmountConflicts(hydrationConflicts) : 'none'}</div>
                        <div>rawInitialBeneficiaryIds: [{(initialData?.beneficiaries || []).join(', ')}]</div>
                        <div>clickedMemberId: {beneficiaryDebug.clickedMemberId || 'none'}</div>
                        <div>selectedBeneficiaryIds: [{beneficiaries.join(', ')}]</div>
                        <div>selectedBeneficiaryCount: {beneficiaries.length}</div>
                        <div>splitMethod: {splitMethod}</div>
                        <div>equalShare: {beneficiaries.length ? (currentTotalTwd / beneficiaries.length).toFixed(2) : '0'}</div>
                      </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">3</span><span className="text-sm font-bold text-[#11183d]">分帳方式</span></div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['EQUAL', 'EXACT', 'PERCENT'] as SplitMethod[]).map(method => (
                            <button key={method} type="button" onClick={() => setSplitMethod(method)} className={`rounded-xl border py-2.5 text-xs font-bold transition-colors ${splitMethod === method ? 'border-violet-500 bg-white text-violet-700' : 'border-transparent bg-white/70 text-slate-500'}`}>
                              {method === 'EQUAL' ? '平均分攤' : method === 'EXACT' ? '指定金額' : '百分比分攤'}
                            </button>
                          ))}
                        </div>
                        {splitMethod === 'EQUAL' && beneficiaries.length > 0 && (
                          <div className="rounded-xl bg-violet-100/70 px-3 py-2 text-xs font-semibold text-violet-800">
                            將由 {beneficiaries.length} 人平均分攤，每人 <span className="font-black">NT${Math.round(currentTotalTwd / beneficiaries.length).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {(splitMethod === 'EXACT' || splitMethod === 'PERCENT') && (
                          <div className="space-y-2">
                              <div className="hidden">
                                  <label className="text-xs font-medium text-gray-600">
                                      {splitMethod === 'EXACT' ? '輸入各人負擔金額 (TWD)' : '輸入各人負擔百分比 (%)'}
                                  </label>
                                  <span className={`text-xs font-mono font-bold ${Math.abs(getRemaining()) < 0.1 ? 'text-green-600' : 'text-red-500'}`}>
                                      {splitMethod === 'EXACT' ? '剩餘: $' : '剩餘: '}
                                      {Math.round(getRemaining())}
                                      {splitMethod === 'PERCENT' ? '%' : ''}
                                  </span>
                              </div>
                              <div className="space-y-2">
                                  <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
                                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{ownerLabel.charAt(0)}</span>
                                      <span className="w-12 truncate text-xs font-bold text-[#11183d]">{ownerLabel}</span>
                                      <span className="text-[10px] font-bold text-slate-400">{splitMethod === 'PERCENT' ? '%' : splitCurrency}</span>
                                      <input 
                                          type="number"
                                      value={effectiveOwnerMemberId === exactLastBeneficiaryId ? Math.round(exactRemainder) : effectiveOwnerMemberId === percentLastBeneficiaryId ? Math.round(percentRemainder) : customInputs[effectiveOwnerMemberId]}
                                          onChange={(e) => handleCustomInputChange(effectiveOwnerMemberId, e.target.value)}
                                          readOnly={(splitMethod === 'EXACT' && effectiveOwnerMemberId === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && effectiveOwnerMemberId === percentLastBeneficiaryId)}
                                          className={`flex-1 border rounded-xl px-2 py-2 text-sm font-mono text-right outline-none focus:border-violet-500 ${((splitMethod === 'EXACT' && effectiveOwnerMemberId === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && effectiveOwnerMemberId === percentLastBeneficiaryId)) ? 'border-violet-200 bg-violet-50 text-[#11183d]' : 'border-violet-200 bg-white text-[#11183d]'}`}
                                          placeholder="0"
                                      />
                                      {((splitMethod === 'EXACT' && effectiveOwnerMemberId === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && effectiveOwnerMemberId === percentLastBeneficiaryId)) && <span className="text-[10px] font-bold text-violet-600 whitespace-nowrap">自動計算</span>}
                                  </div>
                                  {companions.filter(c => beneficiaries.includes(c.id)).map((c, companionIndex) => (
                                      <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
                                          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${companionIndex % 3 === 0 ? 'bg-pink-100 text-pink-700' : companionIndex % 3 === 1 ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>{c.name.charAt(0)}</span>
                                          <span className="text-xs font-bold text-[#11183d] w-12 truncate">{c.name}</span>
                                          <span className="text-[10px] font-bold text-slate-400">{splitMethod === 'PERCENT' ? '%' : splitCurrency}</span>
                                          <input 
                                              type="number"
                                              value={c.id === exactLastBeneficiaryId ? Math.round(exactRemainder) : c.id === percentLastBeneficiaryId ? Math.round(percentRemainder) : customInputs[c.id]}
                                              onChange={(e) => handleCustomInputChange(c.id, e.target.value)}
                                              readOnly={(splitMethod === 'EXACT' && c.id === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && c.id === percentLastBeneficiaryId)}
                                              className={`flex-1 border rounded-xl px-2 py-2 text-sm font-mono text-right outline-none focus:border-violet-500 ${((splitMethod === 'EXACT' && c.id === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && c.id === percentLastBeneficiaryId)) ? 'border-violet-200 bg-violet-50 text-[#11183d]' : 'border-violet-200 bg-white text-[#11183d]'}`}
                                              placeholder="0"
                                          />
                                          {((splitMethod === 'EXACT' && c.id === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && c.id === percentLastBeneficiaryId)) && <span className="text-[10px] font-bold text-violet-600 whitespace-nowrap">自動計算</span>}
                                      </div>
                                  ))}
                              </div>
                              {exactAllocationExceedsTotal && <p className="text-xs font-medium text-red-500">分攤金額超過支出總額</p>}
                              {percentAllocationExceedsTotal && <p className="text-xs font-medium text-red-500">分攤比例超過 100%</p>}
                          </div>
                      )}
                  </div>}
                  </div>
              )}


              {!locked && <SectionHeading>付款資訊</SectionHeading>}

              {!locked && (
                <div>
                   <label className="block text-sm font-bold text-[#11183d] mb-2">付款方式 <span className="text-red-500">*</span></label>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                     {Object.values(PaymentMethod).map(method => {
                       const config = PAYMENT_METHODS_CONFIG[method];
                       const Icon = config.icon;
                       const isSelected = paymentMethod === method;
                       return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          disabled={locked}
                          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all${lockedStyle} ${
                            isSelected
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300'
                              : 'bg-white border border-slate-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          <Icon size={14} /> {config.label}
                        </button>
                       );
                     })}
                   </div>
                </div>
              )}

              {!locked && (
                <div>
                  <label className="mb-2 block text-sm font-bold text-[#11183d]">備註（選填）</label>
                  <div className="flex items-stretch gap-3">
                    <textarea
                      disabled
                      rows={3}
                      placeholder="輸入備註..."
                      className="min-h-[92px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none placeholder:text-slate-300"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      ref={receiptInputRef}
                      onChange={event => { void handleReceiptFiles(event.target.files); }}
                      className="hidden"
                      data-testid="receipt-input"
                    />
                    <button
                      type="button"
                      onClick={() => receiptInputRef.current?.click()}
                      className="flex h-12 shrink-0 items-center gap-1 self-end rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700"
                    >
                      <Camera size={15} /> 新增照片
                    </button>
                  </div>
                  {receiptError && <p className="mt-2 text-xs font-bold text-rose-600">{receiptError}</p>}
                  {/* What was attached, where it can be checked and taken back. */}
                  {receiptPhotos.length > 0 && (
                    <div data-testid="receipt-thumbs" className="mt-3 flex flex-wrap gap-2">
                      {receiptPhotos.map((photo, index) => (
                        <div key={`${index}-${photo.slice(-24)}`} className="relative">
                          <button type="button" onClick={() => setViewingReceipt(photo)} aria-label={`放大收據 ${index + 1}`}>
                            <img src={photo} alt={`收據 ${index + 1}`} className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
                          </button>
                          <button
                            type="button"
                            aria-label={`移除收據 ${index + 1}`}
                            onClick={() => setReceiptPhotos(current => current.filter((_, at) => at !== index))}
                            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
            )}
          </div>

          {(!isAiLoading || statusMessage === '分析中...') && (
            <div className="p-5 bg-white border-t border-slate-100 flex-shrink-0">
                {expenseSaveDebug.submitClicked && expenseSaveDebug.validationError && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{expenseSaveDebug.validationError}</div>
                )}
                <button
                  type="submit"
      disabled={exactAllocationExceedsTotal || percentAllocationExceedsTotal || payerAllocationExceedsTotal}
                  className={`w-full text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all duration-200 transform hover:-translate-y-px active:scale-[0.98] ${
                      exactAllocationExceedsTotal
                        ? 'bg-gray-300 cursor-not-allowed shadow-none'
                        : isEditing
                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30'
                        : 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 shadow-violet-500/30'
                  }`}
                >
                  {isEditing ? <Save size={20} /> : <Plus size={20} />}
                  {proposalMode
                    ? '送出修正建議'
                    : isEditing
                      ? '儲存變更'
                      : isExchange
                        ? '新增換匯紀錄'
                        : '新增這筆支出'}
                </button>
                {isEditing && initialData && onRequestDelete && !proposalMode && (
                  // Subtle destructive entry, deliberately not a large red
                  // button competing with 儲存變更. It only opens the shared
                  // confirmation popup — nothing is removed from here.
                  <button
                    type="button"
                    onClick={() => onRequestDelete(initialData.id)}
                    className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
                  >
                    刪除這筆支出
                  </button>
                )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ExpenseForm;
