
import React, { useState, useEffect, useRef } from 'react';
import { Category, Phase, Expense, PaymentMethod, Companion, SplitMethod, TaxRule } from '../types';
import { CATEGORIES_BY_PHASE, COMMON_CURRENCIES, PAYMENT_METHODS_CONFIG } from '../constants';
import { parseExpenseWithGemini, parseImageExpenseWithGemini } from '../services/geminiService';
import { Sparkles, Loader2, Plus, X, Save, Info, Users, Divide, DollarSign, Percent, Tag, Camera, Image as ImageIcon } from 'lucide-react';

interface Props {
  currentPhase: Phase;
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
  onFetchTaxRule?: (currency: string) => void; 
}

const ExpenseForm: React.FC<Props> = ({ 
  currentPhase, 
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
  taxRule
}) => {
  const [description, setDescription] = useState(initialData?.description || initialDescription || '');
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || (initialAmount ? initialAmount.toString() : ''));
  const [currency, setCurrency] = useState(initialData?.currency || initialCurrency || (taxRule?.currency || 'TWD')); 
  const [exchangeRate, setExchangeRate] = useState<string>(initialData?.exchangeRate.toString() || '1');
  const [handlingFee, setHandlingFee] = useState<string>(initialData?.handlingFee?.toString() || '0');
  const [category, setCategory] = useState<Category>(initialData?.category || initialCategory || CATEGORIES_BY_PHASE[currentPhase][0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialData?.paymentMethod || PaymentMethod.CASH_TWD);
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  
  // Split Bill State
  const [payerId, setPayerId] = useState(initialData?.payerId || 'me');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(initialData?.splitMethod || 'EQUAL');
  
  // Equal Split State
  const [beneficiaries, setBeneficiaries] = useState<string[]>(initialData?.beneficiaries || ['me', ...companions.map(c => c.id)]);
  
  // Advanced Split State (Amount/Percent)
  const [customInputs, setCustomInputs] = useState<Record<string, string>>(() => {
      const initial = { 'me': '' } as Record<string, string>;
      companions.forEach(c => initial[c.id] = '');
      
      if (initialData?.splitAllocations && (initialData.splitMethod === 'EXACT' || initialData.splitMethod === 'PERCENT')) {
           Object.entries(initialData.splitAllocations).forEach(([id, val]) => {
               initial[id] = val.toString();
           });
      }
      return initial;
  });

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [autoRateApplied, setAutoRateApplied] = useState(!!initialData);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Image Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // If companions change, ensure new ones are added to beneficiaries by default if creating new
  useEffect(() => {
      if (!initialData && companions.length > 0) {
          setBeneficiaries(['me', ...companions.map(c => c.id)]);
      }
  }, [companions.length]); 

  // Auto-set exchange rate logic
  useEffect(() => {
    if (currency === 'TWD') {
        setExchangeRate('1');
        return;
    }

    if (paymentMethod === PaymentMethod.CASH_FOREIGN && !autoRateApplied) {
        const exchanges = existingExpenses.filter(e => e.category === Category.EXCHANGE && e.currency === currency);
        if (exchanges.length > 0) {
            const totalForeign = exchanges.reduce((acc, curr) => acc + curr.amount, 0);
            const totalCostTwd = exchanges.reduce((acc, curr) => acc + curr.twdAmount, 0);
            
            if (totalForeign > 0) {
                const avgRate = totalCostTwd / totalForeign;
                setExchangeRate(avgRate.toFixed(4));
                return;
            }
        }
    }

    if (!autoRateApplied) {
        const target = COMMON_CURRENCIES.find(c => c.code === currency);
        if (target) {
            setExchangeRate(target.defaultRate.toString());
        }
    }
  }, [currency, paymentMethod, existingExpenses, autoRateApplied]);

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
                  const parsedDate = result.date || new Date().toISOString().split('T')[0];
                  
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
                      // Default Split
                      payerId: 'me',
                      beneficiaries: ['me', ...companions.map(c => c.id)],
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

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newCurrency = e.target.value;
      setCurrency(newCurrency);
      setAutoRateApplied(false);
      if (newCurrency !== 'TWD' && paymentMethod === PaymentMethod.CASH_TWD) {
          setPaymentMethod(PaymentMethod.CASH_FOREIGN);
      }
      if (newCurrency === 'TWD' && paymentMethod === PaymentMethod.CASH_FOREIGN) {
          setPaymentMethod(PaymentMethod.CASH_TWD);
      }
  };

  const toggleBeneficiary = (id: string) => {
    if (beneficiaries.includes(id)) {
        if (beneficiaries.length > 1) {
            setBeneficiaries(prev => prev.filter(b => b !== id));
        }
    } else {
        setBeneficiaries(prev => [...prev, id]);
    }
  };

  const handleCustomInputChange = (id: string, value: string) => {
      setCustomInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    const rate = parseFloat(exchangeRate);
    const amt = parseFloat(amount);
    const fee = parseFloat(handlingFee || '0');
    
    let totalTwd = amt * rate;
    if (category === Category.EXCHANGE) {
      totalTwd += fee;
    }

    let finalAllocations: Record<string, number> = {};
    
    if (splitMethod === 'EXACT') {
        let totalAllocated = 0;
        Object.entries(customInputs).forEach(([id, val]) => {
            const num = parseFloat((val as string) || '0');
            if (num > 0) {
                finalAllocations[id] = num;
                totalAllocated += num;
            }
        });
        
        if (Math.abs(totalAllocated - totalTwd) > 1) {
            alert(`分帳金額總和 (${Math.round(totalAllocated)}) 與總支出 (${Math.round(totalTwd)}) 不符`);
            return;
        }
    } else if (splitMethod === 'PERCENT') {
        let totalPercent = 0;
        Object.entries(customInputs).forEach(([id, val]) => {
            const pct = parseFloat((val as string) || '0');
            if (pct > 0) {
                finalAllocations[id] = (totalTwd * pct) / 100;
                totalPercent += pct;
            }
        });

        if (Math.abs(totalPercent - 100) > 0.1) {
             alert(`分帳百分比總和 (${totalPercent}%) 必須為 100%`);
             return;
        }
    }

    onSubmit({
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
      payerId,
      beneficiaries,
      splitMethod,
      splitAllocations: finalAllocations,
      needsReview: false // Manual entry assumes review is done
    }, linkedItemId);
    onClose();
  };

  const isExchange = category === Category.EXCHANGE;
  const isEditing = !!initialData;
  const currentTotalTwd = (parseFloat(amount || '0') * parseFloat(exchangeRate || '1')) + (category === Category.EXCHANGE ? parseFloat(handlingFee || '0') : 0);
  
  const getRemaining = () => {
      let sum = 0;
      Object.values(customInputs).forEach(val => {
          sum += parseFloat((val as string) || '0');
      });

      if (splitMethod === 'EXACT') {
          return currentTotalTwd - sum;
      }
      if (splitMethod === 'PERCENT') {
          return 100 - sum;
      }
      return 0;
  };

  // Tax Refund Calculation Logic
  const isEligibleForRefund = taxRule && 
                              taxRule.refundRate > 0 && 
                              currentPhase === 'during' && 
                              parseFloat(amount || '0') >= taxRule.minSpend && 
                              (currency.toUpperCase() === taxRule.currency.toUpperCase()); 

  const estimatedRefund = isEligibleForRefund ? parseFloat(amount || '0') * taxRule.refundRate : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">
             {isEditing 
                ? '編輯支出' 
                : isExchange ? '新增換匯紀錄' : `新增支出 (${currentPhase === 'pre' ? '前' : currentPhase === 'during' ? '中' : '回國機場消費'})`
             }
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Hidden File Input */}
            <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleImageUpload}
            />

            {!showAiInput ? (
               <div className="flex gap-2">
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
              <div className="flex gap-2 animate-fade-in">
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
            
            {isAiLoading && (
              <div className="text-center text-xs text-purple-600 animate-pulse">
                  {statusMessage}
              </div>
            )}
            
            {/* Only show manual form if not in middle of image auto-save */}
            {(!isAiLoading || statusMessage === '分析中...') && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">項目名稱</label>
                <input 
                  required
                  type="text" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder={isExchange ? "例如：桃園機場換匯" : "例如：東京地鐵三日券"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {isExchange ? '換得金額 (外幣)' : '金額'}
                  </label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">幣別</label>
                  <select 
                    value={currency}
                    onChange={handleCurrencyChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  >
                    {COMMON_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                    ))}
                    {/* Add option for the country's currency if it's not in the common list but returned by taxRule */}
                    {taxRule && !COMMON_CURRENCIES.some(c => c.code === taxRule.currency) && (
                        <option value={taxRule.currency}>{taxRule.currency}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Tax Refund Alert */}
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

              {currency !== 'TWD' && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-orange-700 flex items-center gap-1">
                        匯率 (1 {currency} = ? TWD)
                    </label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={exchangeRate}
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

              {companions.length > 0 && !isExchange && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 space-y-3">
                      <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
                           <div className="flex items-center gap-2 text-indigo-700">
                              <Users size={16} />
                              <span className="text-xs font-bold">分帳設定</span>
                           </div>
                           <div className="flex bg-white rounded-lg p-0.5 border border-indigo-200">
                              <button
                                  type="button"
                                  onClick={() => setSplitMethod('EQUAL')}
                                  className={`p-1.5 rounded-md transition-colors ${splitMethod === 'EQUAL' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-500'}`}
                                  title="平分"
                              >
                                  <Divide size={14} />
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setSplitMethod('EXACT')}
                                  className={`p-1.5 rounded-md transition-colors ${splitMethod === 'EXACT' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-500'}`}
                                  title="指定金額"
                              >
                                  <DollarSign size={14} />
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setSplitMethod('PERCENT')}
                                  className={`p-1.5 rounded-md transition-colors ${splitMethod === 'PERCENT' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-500'}`}
                                  title="百分比"
                              >
                                  <Percent size={14} />
                              </button>
                           </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-600">誰付錢？</label>
                          <select 
                              value={payerId}
                              onChange={(e) => setPayerId(e.target.value)}
                              className="text-sm bg-white border border-indigo-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                              <option value="me">我</option>
                              {companions.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                          </select>
                      </div>

                      {splitMethod === 'EQUAL' && (
                          <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">平均分攤給...</label>
                              <div className="flex flex-wrap gap-2">
                                  <button
                                      type="button"
                                      onClick={() => toggleBeneficiary('me')}
                                      className={`text-xs px-2 py-1 rounded border ${beneficiaries.includes('me') ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}
                                  >
                                      我
                                  </button>
                                  {companions.map(c => (
                                      <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => toggleBeneficiary(c.id)}
                                          className={`text-xs px-2 py-1 rounded border ${beneficiaries.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}
                                      >
                                          {c.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {(splitMethod === 'EXACT' || splitMethod === 'PERCENT') && (
                          <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                  <label className="text-xs font-medium text-gray-600">
                                      {splitMethod === 'EXACT' ? '輸入各人負擔金額 (TWD)' : '輸入各人負擔百分比 (%)'}
                                  </label>
                                  <span className={`text-xs font-mono font-bold ${Math.abs(getRemaining()) < 0.1 ? 'text-green-600' : 'text-red-500'}`}>
                                      {splitMethod === 'EXACT' ? '剩餘: $' : '剩餘: '}
                                      {Math.round(getRemaining())}
                                      {splitMethod === 'PERCENT' ? '%' : ''}
                                  </span>
                              </div>
                              <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                      <span className="text-xs w-16 text-right">我</span>
                                      <input 
                                          type="number"
                                          value={customInputs['me']}
                                          onChange={(e) => handleCustomInputChange('me', e.target.value)}
                                          className="flex-1 border border-indigo-200 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500 text-right font-mono"
                                          placeholder="0"
                                      />
                                  </div>
                                  {companions.map(c => (
                                      <div key={c.id} className="flex items-center gap-2">
                                          <span className="text-xs w-16 text-right truncate">{c.name}</span>
                                          <input 
                                              type="number"
                                              value={customInputs[c.id]}
                                              onChange={(e) => handleCustomInputChange(c.id, e.target.value)}
                                              className="flex-1 border border-indigo-200 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500 text-right font-mono"
                                              placeholder="0"
                                          />
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              )}

              <div>
                 <label className="block text-xs font-medium text-gray-500 mb-1">分類</label>
                 <div className="grid grid-cols-3 gap-2">
                   {CATEGORIES_BY_PHASE[currentPhase].map(cat => (
                     <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`text-xs py-2 px-1 rounded border transition-colors ${
                        category === cat 
                          ? 'bg-brand-500 text-white border-brand-600' 
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                     >
                       {cat}
                     </button>
                   ))}
                 </div>
              </div>

              <div>
                 <label className="block text-xs font-medium text-gray-500 mb-1">付款方式</label>
                 <div className="grid grid-cols-2 gap-2">
                   {Object.values(PaymentMethod).map(method => {
                     const config = PAYMENT_METHODS_CONFIG[method];
                     const Icon = config.icon;
                     const isSelected = paymentMethod === method;
                     return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? `${config.color} ring-2 ring-offset-1 ring-gray-200`
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={14} /> {config.label}
                      </button>
                     );
                   })}
                 </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">日期</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            )}
          </div>

          {(!isAiLoading || statusMessage === '分析中...') && (
            <div className="p-4 bg-gray-50 border-t flex-shrink-0">
                <button
                  type="submit"
                  className={`w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all duration-200 transform hover:-translate-y-px active:scale-[0.98] ${
                      isEditing
                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30'
                        : 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/30'
                  }`}
                >
                  {isEditing ? <Save size={20} /> : <Plus size={20} />}
                  {isEditing ? '儲存變更' : (isExchange ? '新增換匯紀錄' : '新增這筆支出')}
                </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ExpenseForm;
