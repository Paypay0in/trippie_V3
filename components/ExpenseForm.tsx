
import { OVERLAY } from '../constants/layers';
import { isForeignSplit, resolveExactSplit, splitTwdToEntry } from '../services/exactSplitCurrency';
import { isRefundableCategory } from '../services/refundableCategories';
import { CustomCategoryRefundability, customCategoryUndecided } from '../services/refundableCustomCategories';
import { Trans, useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { Category, Phase, Expense, PaymentMethod, Companion, SplitMethod, TaxRule, TravelRules, TripMember } from '../types';
import { CATEGORIES_BY_PHASE, COMMON_CURRENCIES, PAYMENT_METHODS_CONFIG, getCategoryIcon } from '../constants';
import { CustomCategories, categoriesForPhase } from '../services/customCategories';
import { parseExpenseWithGemini, parseImageExpenseWithGemini, fetchCurrentExchangeRate } from '../services/geminiService';
import { LEGACY_OWNER_ID, describeMemberAmountConflicts, normalizeMemberIds, normalizeMemberAmountRecord, normalizeOwnerMemberId } from '../services/memberIdentity';
import {
  parseAmount as parsePayerAmount,
  payerAllocationError,
  payerAllocationsToSave,
  payersTotal,
  principalPayerId,
  selectedPayerIds,
  spreadEvenly,
} from '../services/payerAllocations';
import { Sparkles, Loader2, Plus, X, Save, Info, Users, Divide, DollarSign, Percent, Tag, Camera, MapPin, Image as ImageIcon, CalendarDays, FileText, ChevronDown, AlertTriangle, Check, Star } from 'lucide-react';
import { localToday } from '../services/localDate';
import { remainderMemberFor } from '../services/splitRemainderMember';
import { readAndDownscale, RECEIPT_PHOTO } from '../services/postPhotos';
import { expenseNetAmount, refundReceivedInTwd } from '../services/viewerSpend';
import AddPlaceByName from './AddPlaceByName';
import { ResolvedCandidate } from '../services/placeCandidates';

interface Props {
  currentPhase: Phase;
  customCategories: CustomCategories;
  /**
   * What the traveller has already said about their own categories, and the
   * way to answer for a new one.
   *
   * 「這個符合退稅資格但沒有顯示」 — a bill filed under 保養美妝品 fell outside the
   * refund rules entirely, because a category somebody invented is opaque to a
   * list of built-in buckets.
   */
  refundableCustomCategories?: CustomCategoryRefundability;
  onDecideCustomCategory?: (name: string, refundable: boolean) => void;
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
  pre: 'phase.pre',
  during: 'phase.during',
  post: 'phase.post',
  summary: 'phase.summary',
};

const ExpenseForm: React.FC<Props> = ({ 
  currentPhase,
  customCategories,
  refundableCustomCategories = {},
  onDecideCustomCategory,
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
  const { t } = useTranslation();
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
  /** The split box most recently typed into, which decides who carries the rest. */
  const [lastEditedSplitId, setLastEditedSplitId] = useState<string | undefined>(undefined);
  const [heldRemainderId, setHeldRemainderId] = useState<string | undefined>(undefined);
  const [managingCategories, setManagingCategories] = useState(false);
  /** A place chosen by hand for a receipt the scan could not pin down. */
  const [merchantPlace, setMerchantPlace] = useState<ResolvedCandidate | null>(null);
  /** Re-pointing a bill that already has a place. See the block that uses it. */
  const [rebinding, setRebinding] = useState(false);
  /*
    What to look the shop up by.

    The till's own name and the printed address when there is a receipt; the
    line the traveller typed when there is not. Emoji are stripped — 「八十八淺
    草抹茶🍵」 is a name somebody wrote for themselves, and the 🍵 is decoration
    that a place search can only be confused by.
  */
  const placeQuery = [initialData?.merchant || initialData?.description, initialData?.merchantAddress]
    .filter(Boolean)
    .join(' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .trim();
  const [newCategoryName, setNewCategoryName] = useState('');
  const phaseCategories = categoriesForPhase(currentPhase, customCategories);
  const ownCategories = customCategories[currentPhase] ?? [];
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [date, setDate] = useState(initialData?.date || localToday());
  /** 「這個欄位不能輸入」: the 備註 box, which until now was decoration. */
  const [note, setNote] = useState(initialData?.note || '');
  /*
    「順便給星等評分（但這是選填）」.

    Zero is 「not rated」 here, not 「terrible」 — pressing the star you already
    chose clears it, because a rating given by accident must be removable and
    there is nowhere else to remove it from.
  */
  const [rating, setRating] = useState(initialData?.rating ?? 0);
  /*
    The refund the till already gave back, by hand.

    「發票有顯示退稅金額 沒讀到」 — the parser reads 즉시환급 off most Korean
    receipts and misses some, and until now a miss was final: the breakdown only
    ever rendered a refund that the photograph had produced, and nothing on this
    form could put one in. A number printed on the paper in your hand should
    never be unenterable.
  */
  const [refundedAtTill, setRefundedAtTill] = useState(Boolean(initialData?.taxRefundedAtPurchase));
  /*
    「記帳頁面中有這個提示的 也要有一個選項可以選：不可退稅」.

    The hint says a purchase qualifies, from a threshold and a rate; it cannot
    know the shop was not tax-free registered, or that this was a service with a
    price tag. Only the person who was at the counter knows, and until now they
    had nowhere to say it — so the estimate they were about to queue for counted
    purchases that were never coming back.
  */
  const [refundIneligible, setRefundIneligible] = useState(Boolean(initialData?.taxRefundIneligible));
  const [refundAmountInput, setRefundAmountInput] = useState(
    initialData?.taxRefundActual ? String(initialData.taxRefundActual) : '',
  );
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
  const ownerLabel = viewerIsOwner ? t('expense.me') : (ownerName?.trim() || t('expense.tripOwner'));
  /** Marks the viewer's own row, whoever they are. */
  const labelForMember = (id: string, name: string) =>
    id === effectiveViewerMemberId && !viewerIsOwner ? t('expense.nameIsMe', { name }) : name;
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
  /*
    One payer or several.

    「付款者（可多人）· 單一付款／多人付款」. Opens on whichever the record already
    is, so editing a bill two people paid for does not quietly collapse it back
    to one the moment the form loads.
  */
  const [payerMode, setPayerMode] = useState<'single' | 'multi'>(
    Object.keys(hydratedPayerAllocations.values).length > 1 ? 'multi' : 'single'
  );
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
  /** The same parse, from the photo library: 「最好可以上傳收據 相簿中的」. */
  const libraryInputRef = useRef<HTMLInputElement>(null);
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
      setReceiptError(t('expense.receiptMax', { count: MAX_RECEIPTS }));
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    try {
      /*
        Stored smaller than a gallery photo. The parser reads the original
        file, so this costs nothing in recognition — see `RECEIPT_PHOTO`.
      */
      const downscaled = await Promise.all(chosen.map(file => readAndDownscale(file, RECEIPT_PHOTO)));
      setReceiptPhotos(current => [...current, ...downscaled]);
      if (files.length > room) setReceiptError(t('expense.receiptMaxRest', { count: MAX_RECEIPTS }));
    } catch {
      setReceiptError(t('expense.receiptUnreadable'));
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
            const rate = await fetchCurrentExchangeRate(currency, 'TWD', date);
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
    setStatusMessage(t('expense.statusAnalysing'));
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
      setStatusMessage(t('expense.statusAutoCreating'));
      
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
                      description: result.description || t('expense.untitledExpense'),
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
                      /*
                        What was actually bought, kept with the bill.

                        「幫用戶條列商品項目並翻譯用戶使用的語言」 — without the lines
                        the record is a number and a shop name, which is
                        unreadable by the time anybody needs it.
                      */
                      ...(result.items?.length ? { receiptItems: result.items } : {}),
                      // The shop as printed, beside a title that is now
                      // translated: 「會代入但不會翻譯」 asked for the Chinese, and
                      // the receipt in hand still says 광안리 대교밀면.
                      ...(result.merchant ? { merchant: result.merchant } : {}),
                      // 「地址更能協助大數據分析」: a shop name is only a name until
                      // something says where it is.
                      ...(result.merchantAddress ? { merchantAddress: result.merchantAddress } : {}),
                      ...(result.merchantPlaceId ? {
                        merchantPlaceId: result.merchantPlaceId,
                        merchantLatitude: result.merchantLatitude,
                        merchantLongitude: result.merchantLongitude,
                      } : {}),
                      /*
                        What the till already gave back.

                        「這收據上已經有實際退稅的資訊 功能應該要識別實際退稅資訊直接
                        帶入」. The amount stays the gross price, which is what the
                        rest of the ledger expects — the refund is subtracted
                        from it everywhere that asks what this bill cost.
                      */
                      ...(result.taxRefundedAtPurchase
                        ? { taxRefundedAtPurchase: true, ...(result.taxRefundActual ? { taxRefundActual: result.taxRefundActual } : {}) }
                        : {}),
                      needsReview: result.isUncertain
                  };

                  onSubmit(newExpense, linkedItemId);
                  onClose();
              } else {
                  alert(t('expense.cannotReadAmount'));
              }
          };
          reader.onerror = () => {
              setIsAiLoading(false);
              alert(t('expense.imageReadFailed'));
          };
      } catch (err) {
          console.error(err);
          setIsAiLoading(false);
          setStatusMessage(t('expense.statusError'));
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
          const rate = await fetchCurrentExchangeRate(newCurrency, 'TWD', date);
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
      const rate = await fetchCurrentExchangeRate(currency, 'TWD', date);
      setIsFetchingRate(false);
      if (rate) {
          setExchangeRate(rate.toFixed(4));
          setAutoRateApplied(true);
      } else {
          // Keep the rate already on screen — it is the traveller's, or a
          // stored default, and either beats blanking it. But say so: a
          // refresh button that does nothing visible reads as "refreshed".
          setStatusMessage(t('expense.rateLookupFailed'));
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

  /*
    Typing into a box makes it yours; somebody else carries the rest.

    「我可能更清楚 Gina 的是多少錢 … 我希望是兩個都可以」. The remainder used to be
    nailed to the last beneficiary, which decided for the traveller which half
    of the bill they were allowed to know — often the wrong half, because the
    number they actually have is the one read off the receipt in front of them.
  */
  const handleCustomInputChange = (id: string, value: string) => {
      setCustomInputs(prev => ({ ...prev, [id]: value }));
      setLastEditedSplitId(id);
  };

  /*
    Tapping the derived box hands it over, empty.

    It was showing a computed number, so the first keystroke would have landed
    beside it — tap 「19,000」 and type 9 and the box reads 190,009. Clearing it
    on focus makes it an ordinary empty field, which is what somebody who just
    tapped it is expecting to fill in.
  */
  const handleSplitFocus = (id: string) => {
      if (id !== remainderMemberId) return;
      setCustomInputs(prev => ({ ...prev, [id]: '' }));
      setLastEditedSplitId(id);
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

  /*
    Who is being derived rather than typed.

    One box has to be the remainder: two free numbers that must add to a fixed
    total is a form that can disagree with itself, and 10,000 + 10,000 against
    a 19,000 bill is a record nobody can settle. It just is not a fixed seat
    any more — it follows whoever is not typing.
  */
  const remainderMemberId = remainderMemberFor({
      beneficiaries,
      lastEditedId: lastEditedSplitId,
      currentRemainderId: heldRemainderId,
  });
  useEffect(() => {
      if (remainderMemberId !== heldRemainderId) setHeldRemainderId(remainderMemberId);
  }, [remainderMemberId, heldRemainderId]);

  const exactLastBeneficiaryId = splitMethod === 'EXACT' ? remainderMemberId : undefined;

  const getExactManualTotal = () => beneficiaries
      .filter(id => id !== exactLastBeneficiaryId)
      .reduce((sum, id) => sum + Math.max(0, parseFloat(customInputs[id] || '0') || 0), 0);

  const exactRemainder = splitMethod === 'EXACT'
      ? Math.max(0, currentTotalEntry - getExactManualTotal())
      : 0;

  const exactAllocationExceedsTotal = splitMethod === 'EXACT' && getExactManualTotal() > currentTotalEntry + 0.0001;
  const percentLastBeneficiaryId = splitMethod === 'PERCENT' ? remainderMemberId : undefined;
  const getPercentManualTotal = () => beneficiaries
      .filter(id => id !== percentLastBeneficiaryId)
      .reduce((sum, id) => sum + Math.max(0, parseFloat(customInputs[id] || '0') || 0), 0);
  const percentRemainder = splitMethod === 'PERCENT'
      ? Math.max(0, 100 - getPercentManualTotal())
      : 0;
  const percentAllocationExceedsTotal = splitMethod === 'PERCENT' && getPercentManualTotal() > 100.0001;
  const payerIds = selectedPayerIds(payerAllocations, memberOptions.map(m => m.id));
  /*
    What is wrong with the payers, if anything.

    Shown beside the list and checked again on submit. 1,200 and 800 against a
    2,000 bill is right; 1,200 and 800 against a 2,500 one is a receipt the
    traveller has misread, and saving it silently makes the settlement wrong by
    500 with nothing on screen that disagrees.
  */
  const payerError = splitEnabled && !locked && payerMode === 'multi'
    ? payerAllocationError(payerAllocations, memberOptions.map(m => m.id), Math.round(currentTotalTwd))
    : undefined;
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
        setExpenseSaveDebug(current => ({ ...current, validationError: t('expense.errorNameEmpty') }));
        return;
    }
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setExpenseSaveDebug(current => ({ ...current, validationError: t('expense.errorAmountPositive') }));
        return;
    }
    if (!date) {
        setExpenseSaveDebug(current => ({ ...current, validationError: t('expense.errorDateEmpty') }));
        return;
    }
    /*
      Payers that do not add up to the bill.

      Checked here as well as shown beside the list, because the message beside
      the list is advice and this is the thing that stops a settlement being
      quietly wrong by the difference.
    */
    if (payerError) {
        setExpenseSaveDebug(current => ({ ...current, validationError: payerError }));
        return;
    }
    if (hydrationConflicts.length > 0) {
        setExpenseSaveDebug(current => ({
          ...current,
          validationError: t('expense.errorMemberConflict', { detail: describeMemberAmountConflicts(hydrationConflicts) }),
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
            alert(t('expense.errorSplitOverTotal'));
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
             alert(t('expense.errorSplitOverPercent'));
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
          validationError: t('expense.errorMemberConflict', { detail: describeMemberAmountConflicts(submitConflicts) }),
        }));
        return;
    }

    /*
      What the form never asks about, and therefore must not destroy.

      「發票有顯示退稅金額」 arrived at a record that had one and lost it: saving an
      edit replaces the stored bill with exactly what this object carries, and
      the receipt's own findings — the shop, its address, the product lines, the
      refund the till already gave back — are not fields anybody types here.
      Correcting a date silently threw away the reading.
    */
    /*
      Kept in the receipt's own currency, like the amount it comes off.

      Unticking clears it rather than leaving the figure behind: a bill that
      says 「沒有退稅」 while still carrying a refund would quietly subtract it
      from every total that asks what this cost.
    */
    const typedRefund = parseFloat(refundAmountInput);
    const refundFields = refundedAtTill && Number.isFinite(typedRefund) && typedRefund > 0
      ? { taxRefundedAtPurchase: true, taxRefundActual: typedRefund }
      : { taxRefundedAtPurchase: false, taxRefundActual: undefined };

    const readFromReceipt = initialData ? {
      ...(initialData.merchant ? { merchant: initialData.merchant } : {}),
      ...(initialData.merchantAddress ? { merchantAddress: initialData.merchantAddress } : {}),
      /*
        The place this bill was bound to, whether the scan found it or the
        traveller did. The chosen one wins: it is the newer answer, and the
        control that sets it only appears when there was no older one.
      */
      ...(merchantPlace ? {
        merchantPlaceId: merchantPlace.placeId,
        merchantLatitude: merchantPlace.latitude,
        merchantLongitude: merchantPlace.longitude,
      } : initialData.merchantPlaceId ? {
        merchantPlaceId: initialData.merchantPlaceId,
        merchantLatitude: initialData.merchantLatitude,
        merchantLongitude: initialData.merchantLongitude,
      } : {}),
      ...(initialData.receiptItems?.length ? { receiptItems: initialData.receiptItems } : {}),
      ...(initialData.linkedShoppingItemId ? { linkedShoppingItemId: initialData.linkedShoppingItemId } : {}),
    } : {};

    const nextExpense = {
      ...readFromReceipt,
      ...refundFields,
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
      /*
        Everyone who put money down, with what each of them put down.

        This used to take the first name off the map and credit it the whole
        bill, so a 2,000 dinner North paid 1,200 of and Gina 800 was stored as
        North paying all of it — and the settlement that followed was out by
        800 with nothing on any screen to show it. The ledger has always been
        able to read several payers; only this line could not write them.
      */
      payerId: normalizeMemberId(
        splitEnabled
          ? (principalPayerId(payerAllocations, memberOptions.map(m => m.id)) || payerIds[0] || payerId)
          : effectiveViewerMemberId
      ),
      payerAllocations: splitEnabled
        ? normalizeMemberAmountRecord(
            payerAllocationsToSave(payerAllocations, memberOptions.map(m => m.id), totalTwd),
            effectiveOwnerMemberId
          ).values
        : { [normalizeMemberId(effectiveViewerMemberId)]: totalTwd },
      beneficiaries: splitEnabled
        ? normalizeMemberIds(beneficiaries, effectiveOwnerMemberId)
        : [effectiveViewerMemberId],
      splitMethod: splitEnabled ? splitMethod : 'EQUAL',
      splitAllocations: splitEnabled ? submittedSplitAllocations.values : {},
      receiptPhotos,
      // Trimmed to nothing rather than stored as spaces: an empty note and a
      // note made of whitespace are the same thing, and only one of them
      // renders as a blank line under the bill.
      ...(note.trim() ? { note: note.trim() } : {}),
      // Absent rather than 0: 「not rated」 and 「rated nothing」 are different
      // claims, and most bills are a train ticket with nothing to say.
      ...(rating > 0 ? { rating } : {}),
      // Absent rather than false: a bill nobody has marked is simply unmarked,
      // and 「not said」 is not the same claim as 「said it can be refunded」.
      ...(refundIneligible ? { taxRefundIneligible: true } : {}),
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
                              && isRefundableCategory(category, refundableCustomCategories)
                              && parseFloat(amount || '0') >= taxRule.minSpend
                              && (currency.toUpperCase() === taxRule.currency.toUpperCase()); 

  const estimatedRefund = isEligibleForRefund ? parseFloat(amount || '0') * taxRule.refundRate : 0;
  const taxRefundGuidance = isRefundableCategory(category, refundableCustomCategories) ? travelRules?.taxRefund : undefined;

  /*
    One question, on the first bill filed under a category nobody has judged.

    Guessing is wrong both ways: every custom category counted as goods would
    promise a refund on a massage, and none counted is exactly what hid the
    lipstick. The answer belongs to the category, not to this bill, so it is
    asked once and remembered.
  */
  const askAboutCategory = Boolean(
    onDecideCustomCategory
    && currentPhase === 'during'
    && taxRule
    && taxRule.refundRate > 0
    && ownCategories.includes(String(category))
    && customCategoryUndecided(refundableCustomCategories, String(category)),
  );

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
          aria-label={t('expense.receipt')}
          data-testid="receipt-viewer"
          onClick={() => setViewingReceipt(null)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img src={viewingReceipt} alt={t('expense.receipt')} className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            aria-label={t('expense.closeReceipt')}
            onClick={() => setViewingReceipt(null)}
            className="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white"
          >
            <X size={20} />
          </button>
        </div>
      )}
      <div className="bg-white rounded-[28px] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white flex-shrink-0">
          <button onClick={onClose} aria-label={t('common.close')} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500">
            <X size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-[#11183d]">
               {proposalMode
                  ? t('expense.titleProposeChange')
                  : isEditing
                    ? t('expense.titleEdit')
                    : isExchange ? t('expense.titleAddExchange') : t('expense.titleAdd')
               }
            </h2>
            {/* Which part of the ledger this will land in. The categories on
                offer come from it, so when it is wrong — and it has been — the
                form looks broken for no visible reason. */}
            {!proposalMode && !isEditing && (
              <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                {t('expense.filedUnder', { phase: t(PHASE_LABELS[currentPhase]) })}
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
                  {t('expense.unknownMemberWarning')}
                </span>
              </div>
            )}
            {/* Hidden File Input */}
            <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleImageUpload}
            />
            {/*
              The same parse, from the photo library.

              「最好可以上傳收據 相簿中的」. `capture` is not a hint — it takes the
              chooser away, so a receipt photographed an hour ago could not be
              used at all. Two inputs rather than one: the attribute cannot be
              toggled per tap on iOS.
            */}
            <input
                type="file"
                accept="image/*"
                ref={libraryInputRef}
                className="hidden"
                data-testid="receipt-library-input"
                onChange={handleImageUpload}
            />

            {/*
              Where a receipt is actually photographed.

              「在哪可以用這個功能」 — nowhere, as it turned out. The parser, the
              itemisation and the translation all worked, and the only control
              that reached them sat inside a `hidden` div on this form and on a
              batch importer two screens away. A feature with no entry point is
              a feature nobody has.

              On a new expense only: the photo creates the record, so offering
              it while editing one would mean replacing a bill the traveller is
              in the middle of correcting.
            */}
            {!isEditing && !locked && (
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="scan-receipt"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAiLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 px-3 py-3 text-sm font-black text-violet-700 disabled:opacity-60"
                >
                  <Camera size={17} />
                  {isAiLoading ? (statusMessage || t('expense.recognising')) : t('expense.shootReceipt')}
                </button>
                <button
                  type="button"
                  data-testid="pick-receipt"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={isAiLoading}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-60"
                >
                  <ImageIcon size={17} />
                  {t('expense.fromLibrary')}
                </button>
              </div>
            )}
            {!isEditing && !locked && (
              <p className="-mt-3 text-center text-[10px] font-medium leading-4 text-slate-400">
                {t('expense.receiptScanBlurb')}
              </p>
            )}

            {!showAiInput ? (
               <div className="hidden">
                   <button 
                     type="button"
                     onClick={() => setShowAiInput(true)}
                     className="flex-1 py-2 bg-gradient-to-r from-purple-50 to-blue-50 text-purple-700 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-purple-200 hover:from-purple-100 hover:to-blue-100 transition-colors"
                   >
                     <Sparkles size={16} /> {t('expense.aiVoiceOrText')}
                   </button>
                   <button 
                     type="button"
                     onClick={() => fileInputRef.current?.click()}
                     className="px-4 py-2 bg-white text-gray-600 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
                     title={t('expense.uploadReceipt')}
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
                  placeholder={isAiLoading ? statusMessage || t('expense.analysing') : t('expense.freeTextPlaceholder')}
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
                <div className="font-bold text-violet-900">{t('expense.refundReminder')}</div>
                <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">{taxRefundGuidance.guidance.split('\n').slice(0, 3).join('\n')}</p>
                <p className="mt-2 text-[11px] text-slate-500">{t('expense.refundEligibilityCaveat')}</p>
              </div>
            )}
            
            {isAiLoading && (
              <div className="text-center text-xs text-purple-600 animate-pulse">
                  {statusMessage}
              </div>
            )}
            
            {/* Only show manual form if not in middle of image auto-save */}
            {(!isAiLoading || statusMessage === t('expense.statusAnalysing')) && (
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
                      aria-label={t('expense.enlargeReceipt')}
                      data-testid="summary-receipt"
                      className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full shadow-sm ring-1 ring-violet-100"
                    >
                      <img src={receiptPhotos[0]} alt={t('expense.receipt')} className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
                      <SummaryIcon size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#11183d]">
                      {initialData.description || t('expense.thisExpense')}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      {initialData.date.replace(/-/g, '/')}
                      {/*
                        The shop as printed, under a translated title.

                        「會代入但不會翻譯」 asked for the Chinese name; this is what
                        still matches the paper in hand and the line on the card
                        statement. Omitted when it is the same string, which is
                        most of a trip at home.
                      */}
                      {initialData.merchant && initialData.merchant !== initialData.description && (
                        <span data-testid="expense-merchant" className="ml-1.5 text-slate-400">
                          · {initialData.merchant}
                        </span>
                      )}
                    </div>
                    {/* Where it was, when the receipt printed it. */}
                    {initialData.merchantAddress && (
                      <div data-testid="expense-merchant-address" className="mt-0.5 flex items-start gap-1 text-[10px] font-medium leading-4 text-slate-400">
                        <MapPin size={10} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">{initialData.merchantAddress}</span>
                      </div>
                    )}
                    {/*
                      The address as a place, when the scan could not manage it.

                      `merchantPlaceId` is only written when the place service
                      returned an address bearing the same street number the
                      receipt printed, and a restaurant on the fourth floor of
                      a named building routinely misses that — so the bill looks
                      fully resolved and carries no id, and nothing on the
                      collection screen can find it.

                      The search is prefilled from whatever the bill has and
                      runs on open, but the candidates are still a list to pick
                      from. A receipt bound to the wrong shop would be worse
                      than one bound to none.

                      「這間店在收藏中有 但沒給收據 在記帳中就無法出現地址讓AI配對
                      收藏的店家」 — this used to require a printed address, so a
                      bill typed by hand could never be bound to anything. A
                      typed bill has no address by definition; it has a name,
                      and a name is what a search takes.
                    */}
                    {!locked && !merchantPlace && placeQuery && (
                      <div className="mt-1.5">
                        {/*
                          Said either way. 「這個本來不是可以 match 收藏清單了
                          嗎」 — a bill already bound to a place showed nothing
                          at all, which is exactly what a bill that *cannot* be
                          bound shows. Two different states, one blank space,
                          and no way to tell from the screen which one you are
                          looking at.
                        */}
                        {initialData.merchantPlaceId ? (
                          <div data-testid="expense-place-bound" className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-emerald-700">{t('expense.mappedToPlace')}</span>
                            <button
                              type="button"
                              data-testid="rebind-expense-place"
                              onClick={() => setRebinding(true)}
                              className="text-[10px] font-black text-[#5b3df5]"
                            >
                              {t('expense.changePlace')}
                            </button>
                          </div>
                        ) : null}
                        {(!initialData.merchantPlaceId || rebinding) && (
                          <AddPlaceByName
                            label={t('expense.mapToPlace')}
                            defaultQuery={placeQuery}
                            searchOnOpen
                            context={{}}
                            onAdd={setMerchantPlace}
                          />
                        )}
                      </div>
                    )}
                    {merchantPlace && (
                      <p data-testid="expense-merchant-linked" className="mt-1.5 text-[10px] font-bold text-emerald-700">
                        {t('expense.mappedPending', { place: merchantPlace.placeName })}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 whitespace-nowrap text-base font-black text-[#11183d]">
                    NT$ {Math.round(initialData.twdAmount).toLocaleString()}
                  </div>
                </div>
              )}

              {/*
                What the receipt said, in both languages.

                「幫用戶條列商品項目並翻譯用戶使用的語言」. Beside the total, because
                the question being asked of this screen is 「what was this
                107,000 원」 — and the printed name stays next to the translation
                so the line can still be matched against the paper itself.
              */}
              {/*
                Said when there is nothing to say.

                「又沒有翻譯了」 — asked of a bill that simply has no receipt
                lines, because nothing distinguished 「this bill was not created
                from a photo」 from 「the parser failed you again」. An empty
                space answers neither question, and the traveller has no way to
                tell which one they are looking at.
              */}
              {initialData && !initialData.receiptItems?.length && (
                <p data-testid="no-receipt-items" className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-medium leading-4 text-slate-400">
                  {t('expense.noReceiptLines')}
                </p>
              )}

              {initialData?.receiptItems?.length ? (
                <div data-testid="receipt-items" className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="text-[11px] font-black text-slate-500">{t('expense.receiptLines')}</p>
                  <ul className="mt-1.5 space-y-1">
                    {initialData.receiptItems.map((line, index) => (
                      <li key={`${line.name}-${index}`} className="flex items-start gap-2 text-xs">
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-[#11183d]">
                            {line.translatedName || line.name}
                            {line.quantity && line.quantity > 1 ? ` × ${line.quantity}` : ''}
                          </span>
                          {line.translatedName && (
                            <span className="block text-[10px] font-medium text-slate-400">{line.name}</span>
                          )}
                        </span>
                        {Number.isFinite(line.amount) && (
                          <span className={`shrink-0 font-mono text-[11px] font-bold ${
                            (line.amount as number) < 0 ? 'text-emerald-600' : 'text-slate-600'
                          }`}>
                            {(line.amount as number).toLocaleString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[10px] font-medium leading-4 text-slate-400">
                    {t('expense.receiptLinesBlurb')}
                  </p>
                </div>
              ) : null}

              {proposalMode && (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-900 ring-1 ring-amber-100">
                  <Trans i18nKey="expense.proposalBlurb" components={{ b: <b className="font-black" /> }} />
                </p>
              )}

              {proposalMode && (
                <div>
                  {/*
                    「這個分帳建議沒有留言區可以寫留言」.

                    A proposal was sent with the sentence 我想提出以下修正建議。
                    every time, whoever sent it and whatever they meant. The
                    numbers say what to change; only the sender can say why, and
                    the creator reading it is being asked to approve something
                    on trust without it. The type always carried a message —
                    「A question plus the exact change」 — the form simply never
                    asked for one.
                  */}
                  <label className="mb-2 block text-sm font-bold text-[#11183d]">
                    {t('expense.noteOptional')}
                  </label>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    aria-label={t('expense.proposalNote')}
                    data-testid="proposal-message"
                    placeholder={t('expense.proposalNotePlaceholder')}
                    className="min-h-[88px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#11183d] outline-none placeholder:text-slate-300 focus:border-violet-300"
                  />
                </div>
              )}

              {!locked && <SectionHeading>{t('expense.sectionBasics')}</SectionHeading>}

              {!locked && (
                <div>
                  <label className="block text-sm font-bold text-[#11183d] mb-2">{t('expense.fieldName')} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input 
                      required
                      type="text"
                      value={description}
                      disabled={locked}
                      onChange={e => setDescription(e.target.value)}
                      className={`w-full h-12 border border-slate-200 rounded-2xl px-4 pr-11 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none${lockedStyle}`}
                      placeholder={t('expense.fieldNamePlaceholder')}
                    />
                    <FileText size={17} className="pointer-events-none absolute right-4 top-3.5 text-slate-300" />
                  </div>
                </div>
              )}

              {!locked && (
                <div>
                   <div className="mb-2 flex items-center justify-between">
                     <label className="block text-sm font-bold text-[#11183d]">{t('expense.fieldCategory')} <span className="text-red-500">*</span></label>
                     <button type="button" onClick={() => setManagingCategories(current => !current)} className="text-xs font-bold text-violet-600">{managingCategories ? t('common.done') : t('expense.manageCategories')}</button>
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
                           placeholder={t('expense.newCategoryPlaceholder')}
                           className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300"
                         />
                         <button
                           type="button"
                           onClick={() => { onAddCustomCategory(currentPhase, newCategoryName); setNewCategoryName(''); }}
                           disabled={!newCategoryName.trim()}
                           className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-black text-white disabled:opacity-40"
                         >{t('common.add')}</button>
                       </div>
                       {ownCategories.length > 0 ? (
                         <div className="mt-2.5 flex flex-wrap gap-2">
                           {ownCategories.map(name => (
                             <span key={name} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                               {name}
                               {/* Changeable here too: an answer given in a hurry
                                   beside one bill should not be permanent. */}
                               {onDecideCustomCategory && (
                                 <button
                                   type="button"
                                   data-testid={`toggle-category-refundable-${name}`}
                                   aria-pressed={refundableCustomCategories[name] === true}
                                   onClick={() => onDecideCustomCategory(name, refundableCustomCategories[name] !== true)}
                                   className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                                     refundableCustomCategories[name] === true
                                       ? 'bg-violet-100 text-violet-700'
                                       : 'bg-slate-100 text-slate-400'
                                   }`}
                                 >{t('expense.refundable')}</button>
                               )}
                               <button type="button" aria-label={t('expense.deleteCategory', { name })} onClick={() => onRemoveCustomCategory(currentPhase, name)} className="text-slate-400">
                                 <X size={13} />
                               </button>
                             </span>
                           ))}
                         </div>
                       ) : (
                         <p className="mt-2.5 text-xs text-slate-400">{t('expense.noCustomCategories')}</p>
                       )}
                     </div>
                   )}
                   {/*
                     Asked where the bill is, not in a settings screen.

                     This is the moment somebody knows the answer: they are
                     looking at a lipstick they just bought. 「這個符合退稅資格但
                     沒有顯示」 was found on the expense, not in a menu.
                   */}
                   {askAboutCategory && (
                     <div data-testid="ask-category-refundable" className="mb-2 rounded-2xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
                       <p className="text-[11px] font-bold leading-5 text-[#11183d]">
                         {t('expense.askRefundable', { category: String(category) })}
                       </p>
                       <div className="mt-1.5 flex gap-1.5">
                         <button
                           type="button"
                           data-testid="category-refundable-yes"
                           onClick={() => onDecideCustomCategory?.(String(category), true)}
                           className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-[11px] font-black text-white"
                         >{t('expense.yesRefundable')}</button>
                         <button
                           type="button"
                           data-testid="category-refundable-no"
                           onClick={() => onDecideCustomCategory?.(String(category), false)}
                           className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-500"
                         >{t('expense.notRefundableService')}</button>
                       </div>
                       <p className="mt-1.5 text-[10px] font-medium leading-4 text-slate-400">
                         {t('expense.answerRememberedOnCategory')}
                       </p>
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
                  <label className="block text-sm font-bold text-[#11183d] mb-2">{t('expense.fieldAmount')} <span className="text-red-500">*</span></label>
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
                          {t('expense.exchangeRateLabel', { currency })}
                          <button 
                            type="button" 
                            onClick={handleRefreshRate}
                            disabled={isFetchingRate}
                            className="ml-1 px-2 py-1 hover:bg-orange-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 border border-orange-200 bg-white shadow-sm"
                            title={t('expense.fetchRateForDate')}
                          >
                            {isFetchingRate ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span className="text-[10px] font-bold whitespace-nowrap">
                              {/* The day the rate is for is the day the money was
                                  spent — 「10/3的 有辦法讓匯率 就用10/3的嗎」. It used
                                  to print today's date whatever the purchase date
                                  was, which read as a fact and was not one. */}
                              {t('expense.rateOnDate', { date: (date || localToday()).replace(/-/g, '/') })}
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
                        <label className="text-xs font-medium text-orange-700">{t('expense.handlingFee')}</label>
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
                      {t('expense.costCalculation')} <span className="font-mono font-bold text-orange-800 text-sm">
                        {Math.round(currentTotalTwd).toLocaleString()}
                      </span> TWD
                    </div>
                  </div>
              )}
                </div>
                {!locked && (
                  <div>
                    <label className="block text-sm font-bold text-[#11183d] mb-2">{t('expense.fieldDate')} <span className="text-red-500">*</span></label>
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
                          {initialData.taxRefundedAtPurchase ? t('expense.refundedAtTill') : t('expense.refundReceived')}
                      </div>
                      {/*
                        The subtraction happens in the currency it happened in.

                        「消費是韓幣 我覺得退稅計算要用韓幣 最後才估台幣 不然這樣使用
                        不直覺」. The shop charged 112,800 KRW and handed back 7,000
                        KRW — both of those are on paper, in won. Showing the
                        sum as NT$2,673 − NT$166 asks the reader to verify a
                        subtraction neither of whose terms they have ever seen.

                        TWD is what the trip settles in, so it closes the block
                        as one converted line rather than disappearing.
                      */}
                      {(() => {
                        const refundEntry = initialData.taxRefundActual;
                        const foreign = initialData.currency !== 'TWD'
                          && Number.isFinite(refundEntry as number)
                          && (refundEntry as number) > 0;
                        const unit = foreign ? initialData.currency : 'NT$';
                        const gross = foreign ? initialData.amount : initialData.twdAmount;
                        const back = foreign ? (refundEntry as number) : refundReceivedInTwd(initialData);
                        const money = (value: number) => (foreign
                          ? `${Math.round(value).toLocaleString()} ${unit}`
                          : `NT$ ${Math.round(value).toLocaleString()}`);
                        return (
                          <div className="mt-2 space-y-1 text-xs text-emerald-900">
                              <div className="flex justify-between">
                                  <span>{t('expense.originalAmount')}</span>
                                  <span className="font-mono">{money(gross)}</span>
                              </div>
                              <div className="flex justify-between">
                                  <span>{t('expense.refundedAmount')}</span>
                                  <span className="font-mono">− {money(back)}</span>
                              </div>
                              <div className="flex justify-between border-t border-emerald-200 pt-1 font-bold">
                                  <span>{t('expense.actualSpend')}</span>
                                  <span className="font-mono">{money(Math.max(0, gross - back))}</span>
                              </div>
                              {foreign && (
                                  <div className="flex justify-between text-emerald-700/70">
                                      <span>{t('expense.approx')}</span>
                                      <span className="font-mono">NT$ {Math.round(expenseNetAmount(initialData)).toLocaleString()}</span>
                                  </div>
                              )}
                          </div>
                        );
                      })()}
                      <p className="mt-2 text-[10px] leading-4 text-emerald-700/70">
                          {t('expense.actualSpendBlurb')}
                      </p>
                  </div>
              )}

              {/*
                Entering the refund the photograph missed.

                「發票有顯示退稅金額 沒讀到」. The parser finds 즉시환급 on most Korean
                receipts and misses some, and a miss used to be final — the
                breakdown above only renders a refund that already exists, and
                nothing here could create one. Offered on an existing bill,
                where there is a receipt to read it off.
              */}
              {isEditing && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <label className="flex items-center gap-2.5">
                          <input
                              type="checkbox"
                              data-testid="refunded-at-till"
                              checked={refundedAtTill}
                              onChange={event => setRefundedAtTill(event.target.checked)}
                              className="h-4 w-4 accent-emerald-600"
                          />
                          <span className="text-sm font-bold text-[#11183d]">{t('expense.refundedAtTill')}</span>
                      </label>
                      {refundedAtTill && (
                          <div className="mt-2.5">
                              <label className="block text-[11px] font-bold text-slate-500">
                                  {t('expense.refundAmountField', { currency })}
                              </label>
                              <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  data-testid="refund-amount"
                                  value={refundAmountInput}
                                  onChange={event => setRefundAmountInput(event.target.value)}
                                  placeholder={t('expense.refundAmountPlaceholder')}
                                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                              />
                              {/*
                                Typed in the currency it was printed in. The
                                shop handed back won, not NT$, and asking for
                                the converted figure means checking a number
                                nobody has ever seen.
                              */}
                              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                                  {t('expense.refundAmountBlurb')}
                              </p>
                          </div>
                      )}
                  </div>
              )}

              {isEligibleForRefund && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 animate-fade-in shadow-sm">
                      <div className="flex items-start gap-3">
                          <div className="bg-amber-100 p-1.5 rounded-full">
                              <Tag className="text-amber-600" size={16} />
                          </div>
                          <div>
                              <div className="font-bold text-amber-800 text-sm">💡 {t('expense.qualifiesForRefund', { country: taxRule.country })}</div>
                              <div className="text-xs text-amber-700 mt-1">
                                  {t('expense.refundThreshold', { minSpend: taxRule.minSpend.toLocaleString(), currency: taxRule.currency })}
                                  <br/>
                                  <Trans i18nKey="expense.estimatedRefund" values={{ amount: `${estimatedRefund.toLocaleString()} ${taxRule.currency}` }} components={{ strong: <span className="font-bold text-amber-800" /> }} />
                              </div>
                              <div className="text-[10px] text-amber-600 mt-1 italic">
                                  * {taxRule.notes}
                              </div>
                          </div>
                      </div>
                      {/*
                        Said where the claim is made. A mark buried in a menu is
                        a mark nobody makes, and this is the moment the figure is
                        in front of them.
                      */}
                      <label className="mt-3 flex items-center gap-2.5 border-t border-amber-200/70 pt-3">
                          <input
                              type="checkbox"
                              data-testid="refund-ineligible"
                              checked={refundIneligible}
                              onChange={event => setRefundIneligible(event.target.checked)}
                              className="h-4 w-4 accent-amber-600"
                          />
                          <span className="text-xs font-bold text-amber-900">
                              {t('expense.markNotRefundable')}
                          </span>
                      </label>
                  </div>
              )}

              {!isExchange && <SectionHeading>{t('expense.sectionSplit')}</SectionHeading>}

              {!isExchange && (
                  <div className="rounded-2xl border border-violet-100 bg-[#f5f1ff] p-4 space-y-4">
                      {!locked && (
                        <button type="button" disabled={locked} onClick={() => setSplitEnabled(value => !value)} className={`w-full flex items-center justify-between text-left${lockedStyle}`}>
                          <span className="flex items-center gap-3"><Users size={21} className="text-violet-600" /><span><span className="block text-sm font-bold text-[#11183d]">{t('expense.splitThisExpense')}</span><span className="block text-xs text-slate-500 mt-0.5">{t('expense.splitThisExpenseBlurb')}</span></span></span>
                          <span className={`relative h-7 w-12 rounded-full transition-colors ${splitEnabled ? 'bg-violet-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${splitEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></span>
                        </button>
                      )}
                  {splitEnabled && <div className="space-y-5 border-t border-violet-200/70 pt-4">
                      <div className="flex items-center justify-between pb-1">
                           <div className="flex items-center gap-2 text-[#11183d]">
                              <Users size={16} />
                              <span className="text-sm font-bold">{t('expense.sectionSplit')}</span>
                           </div>
                  <button type="button" onClick={onManageMembers} className="text-xs font-bold text-violet-600">{t('expense.adjustMembers')}</button>
                      </div>
                      {!locked && (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">1</span>
                              <div>
                                <div className="text-sm font-bold text-[#11183d]">{t('expense.payersTitle')}</div>
                                <div className="text-[11px] text-slate-500">{t('expense.payersBlurb')}</div>
                              </div>
                            </div>
                            {/*
                              One payer or several.

                              「付款者（可多人）」. A 2,000 dinner where each hands
                              over part of the cash is one receipt and one thing
                              bought; recording it as two bills to say who paid
                              would invent a purchase nobody made.
                            */}
                            <div className="flex shrink-0 rounded-full bg-white p-0.5 text-[11px] font-bold">
                              {(['single', 'multi'] as const).map(mode => (
                                <button
                                  key={mode}
                                  type="button"
                                  data-testid={`payer-mode-${mode}`}
                                  aria-pressed={payerMode === mode}
                                  onClick={() => {
                                    setPayerMode(mode);
                                    if (mode === 'single') {
                                      const keep = principalPayerId(payerAllocations, memberOptions.map(m => m.id))
                                        || effectiveViewerMemberId;
                                      setPayerAllocations({ [keep]: '' });
                                    }
                                  }}
                                  className={`rounded-full px-3 py-1.5 transition-colors ${payerMode === mode ? 'bg-violet-600 text-white' : 'text-slate-500'}`}
                                >
                                  {mode === 'single' ? t('expense.payerSingle') : t('expense.payerMulti')}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {memberOptions.map((member, index) => {
                              const selected = payerIds.includes(member.id);
                              const only = payerMode === 'single';
                              return (
                                <div
                                  key={member.id}
                                  data-testid={`payer-row-${member.id}`}
                                  className={`flex items-center gap-3 px-3 py-2.5 ${index > 0 ? 'border-t border-slate-100' : ''}`}
                                >
                                  <button
                                    type="button"
                                    aria-label={t('expense.choosePayer', { name: member.name })}
                                    aria-pressed={selected}
                                    data-testid={`payer-pick-${member.id}`}
                                    onClick={() => {
                                      if (only) { setPayerAllocations({ [member.id]: '' }); return; }
                                      setPayerAllocations(current => {
                                        const next = { ...current };
                                        if (next[member.id] !== undefined) delete next[member.id];
                                        else next[member.id] = '';
                                        return next;
                                      });
                                    }}
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center text-white ${only ? 'rounded-full' : 'rounded-md'} ${selected ? 'bg-violet-600' : 'border-2 border-slate-300 bg-white'}`}
                                  >
                                    {selected && <Check size={14} strokeWidth={3.5} />}
                                  </button>
                                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {member.name.charAt(0)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{member.name}</span>
                                  {/*
                                    The amount only exists where it can mean
                                    something. With one payer the bill is theirs
                                    entire, and a box inviting a figure there is
                                    a box inviting a wrong one.
                                  */}
                                  {payerMode === 'multi' ? (
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      data-testid={`payer-amount-${member.id}`}
                                      aria-label={t('expense.howMuchPaid', { name: member.name })}
                                      value={selected ? (payerAllocations[member.id] ?? '') : ''}
                                      disabled={!selected}
                                      onChange={event => setPayerAllocations(current => ({ ...current, [member.id]: event.target.value }))}
                                      placeholder={t('expense.enterAmount')}
                                      className="w-28 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-black text-[#11183d] placeholder:text-[11px] placeholder:font-bold placeholder:text-slate-300 disabled:bg-slate-50"
                                    />
                                  ) : (
                                    <span className="shrink-0 text-sm font-black text-[#11183d]">
                                      {selected ? `NT$ ${Math.round(currentTotalTwd).toLocaleString()}` : ''}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {payerMode === 'multi' && (
                              <div className="flex items-center justify-between gap-2 bg-violet-50 px-3 py-2.5 text-[11px] font-bold">
                                <span data-testid="payer-summary" className="text-violet-700">
                                  {t('expense.payerSummary', { count: payerIds.length, total: Math.round(payersTotal(payerAllocations, memberOptions.map(m => m.id))).toLocaleString() })}
                                </span>
                                <button
                                  type="button"
                                  data-testid="payer-spread-evenly"
                                  onClick={() => setPayerAllocations(current =>
                                    spreadEvenly(current, memberOptions.map(m => m.id), Math.round(currentTotalTwd)))}
                                  className="shrink-0 text-violet-600"
                                >
                                  {t('expense.splitEvenly')}
                                </button>
                              </div>
                            )}
                          </div>
                          {payerError && (
                            <p data-testid="payer-error" className="text-[11px] font-bold text-rose-600">{payerError}</p>
                          )}
                        </div>
                      )}

                      {(
                          <div>
                              <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">2</span><div><div className="text-sm font-bold text-[#11183d]">{t('expense.beneficiariesTitle', { count: beneficiaries.length })}</div><div className="text-[11px] text-slate-500">{t('expense.beneficiariesBlurb')}</div></div></div><button type="button" onClick={onManageMembers} className="text-xs font-bold text-violet-600">{t('expense.adjustMembers')}</button></div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <button
                                      type="button"
                                      onClick={() => toggleBeneficiary(effectiveOwnerMemberId)}
                                      className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${beneficiaries.includes(effectiveOwnerMemberId) ? 'bg-violet-50 text-violet-700 border-violet-400' : 'bg-white text-gray-500 border-slate-200'}`}
                                  >
                                      <input type="checkbox" readOnly checked={beneficiaries.includes(effectiveOwnerMemberId)} className="accent-violet-600" aria-label={t('expense.selectMember', { name: ownerLabel })} />
                                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${beneficiaries.includes(effectiveOwnerMemberId) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{ownerLabel.charAt(0)}</span>{ownerLabel}
                                  </button>
                                  {companions.map(c => (
                                      <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => toggleBeneficiary(c.id)}
                                          className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${beneficiaries.includes(c.id) ? 'bg-violet-50 text-violet-700 border-violet-400' : 'bg-white text-gray-500 border-slate-200'}`}
                                      >
                                          <input type="checkbox" readOnly checked={beneficiaries.includes(c.id)} className="accent-violet-600" aria-label={t('expense.selectMember', { name: labelForMember(c.id, c.name) })} />
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
                        <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">3</span><span className="text-sm font-bold text-[#11183d]">{t('expense.splitMethod')}</span></div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['EQUAL', 'EXACT', 'PERCENT'] as SplitMethod[]).map(method => (
                            <button key={method} type="button" onClick={() => setSplitMethod(method)} className={`rounded-xl border py-2.5 text-xs font-bold transition-colors ${splitMethod === method ? 'border-violet-500 bg-white text-violet-700' : 'border-transparent bg-white/70 text-slate-500'}`}>
                              {t(`expense.splitMethodOption.${method}`)}
                            </button>
                          ))}
                        </div>
                        {splitMethod === 'EQUAL' && beneficiaries.length > 0 && (
                          <div className="rounded-xl bg-violet-100/70 px-3 py-2 text-xs font-semibold text-violet-800">
                            <Trans i18nKey="expense.splitEquallyAmong" values={{ count: beneficiaries.length, each: `NT$${Math.round(currentTotalTwd / beneficiaries.length).toLocaleString()}` }} components={{ strong: <span className="font-black" /> }} />
                          </div>
                        )}
                      </div>

                      {(splitMethod === 'EXACT' || splitMethod === 'PERCENT') && (
                          <div className="space-y-2">
                              <div className="hidden">
                                  <label className="text-xs font-medium text-gray-600">
                                      {splitMethod === 'EXACT' ? t('expense.enterExactPerPerson') : t('expense.enterPercentPerPerson')}
                                  </label>
                                  <span className={`text-xs font-mono font-bold ${Math.abs(getRemaining()) < 0.1 ? 'text-green-600' : 'text-red-500'}`}>
                                      {splitMethod === 'EXACT' ? t('expense.remainingAmount') : t('expense.remainingPercent')}
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
                                          data-testid={`split-input-${effectiveOwnerMemberId}`}
                                          onFocus={() => handleSplitFocus(effectiveOwnerMemberId)}
                                          className={`flex-1 border rounded-xl px-2 py-2 text-sm font-mono text-right outline-none focus:border-violet-500 ${((splitMethod === 'EXACT' && effectiveOwnerMemberId === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && effectiveOwnerMemberId === percentLastBeneficiaryId)) ? 'border-violet-200 bg-violet-50 text-[#11183d]' : 'border-violet-200 bg-white text-[#11183d]'}`}
                                          placeholder="0"
                                      />
                                      {((splitMethod === 'EXACT' && effectiveOwnerMemberId === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && effectiveOwnerMemberId === percentLastBeneficiaryId)) && <span data-testid={`auto-split-${effectiveOwnerMemberId}`} className="text-[10px] font-bold text-violet-600 whitespace-nowrap">{t('expense.autoCalculated')}</span>}
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
                                              data-testid={`split-input-${c.id}`}
                                              onFocus={() => handleSplitFocus(c.id)}
                                              className={`flex-1 border rounded-xl px-2 py-2 text-sm font-mono text-right outline-none focus:border-violet-500 ${((splitMethod === 'EXACT' && c.id === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && c.id === percentLastBeneficiaryId)) ? 'border-violet-200 bg-violet-50 text-[#11183d]' : 'border-violet-200 bg-white text-[#11183d]'}`}
                                              placeholder="0"
                                          />
                                          {((splitMethod === 'EXACT' && c.id === exactLastBeneficiaryId) || (splitMethod === 'PERCENT' && c.id === percentLastBeneficiaryId)) && <span data-testid={`auto-split-${c.id}`} className="text-[10px] font-bold text-violet-600 whitespace-nowrap">{t('expense.autoCalculated')}</span>}
                                      </div>
                                  ))}
                              </div>
                              {exactAllocationExceedsTotal && <p className="text-xs font-medium text-red-500">{t('expense.errorSplitOverTotal')}</p>}
                              {percentAllocationExceedsTotal && <p className="text-xs font-medium text-red-500">{t('expense.errorSplitOverPercent')}</p>}
                          </div>
                      )}
                  </div>}
                  </div>
              )}


              {!locked && <SectionHeading>{t('expense.sectionPayment')}</SectionHeading>}

              {!locked && (
                <div>
                   <label className="block text-sm font-bold text-[#11183d] mb-2">{t('expense.fieldPaymentMethod')} <span className="text-red-500">*</span></label>
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
                  {/*
                    「這樣能讓用戶直接無痛紀錄他經歷的事情」 — the one moment
                    somebody reliably opens this app about a place they have
                    just been to is paying for it. Optional, and silent about
                    itself when nothing is chosen.
                  */}
                  <label className="mb-2 block text-sm font-bold text-[#11183d]">{t('expense.ratingOptional')}</label>
                  <div data-testid="expense-rating" className="mb-5 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        aria-label={t('expense.starCount', { count: star })}
                        aria-pressed={rating >= star}
                        data-testid={`expense-rating-${star}`}
                        onClick={() => setRating(rating === star ? 0 : star)}
                        className="p-1"
                      >
                        <Star
                          size={24}
                          className={rating >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
                        />
                      </button>
                    ))}
                    {rating > 0 && (
                      <span className="ml-1 text-[11px] font-bold text-slate-400">{t('expense.tapAgainToClear')}</span>
                    )}
                  </div>

                  <label className="mb-2 block text-sm font-bold text-[#11183d]">{t('expense.noteFieldOptional')}</label>
                  <div className="flex items-stretch gap-3">
                    {/*
                      「這個欄位不能輸入」 — it was `disabled`, with no value, no
                      handler and no column behind it. The label had been
                      promising something the form could not do.
                    */}
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      aria-label={t('expense.noteField')}
                      data-testid="expense-note"
                      placeholder={t('expense.notePlaceholder')}
                      className="min-h-[92px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#11183d] outline-none placeholder:text-slate-300 focus:border-violet-300"
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
                          <button type="button" onClick={() => setViewingReceipt(photo)} aria-label={t('expense.enlargeReceiptIndexed', { index: index + 1 })}>
                            <img src={photo} alt={t('expense.receiptIndexed', { index: index + 1 })} className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('expense.removeReceiptIndexed', { index: index + 1 })}
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
                    ? t('expense.submitProposal')
                    : isEditing
                      ? t('expense.saveChanges')
                      : isExchange
                        ? t('expense.titleAddExchange')
                        : t('expense.addThisExpense')}
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
                    {t('expense.deleteThisExpense')}
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
