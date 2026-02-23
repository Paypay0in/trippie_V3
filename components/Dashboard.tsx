
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Expense, Category, PaymentMethod, Phase, Companion, TaxRule, VisaInfo } from '../types';
import { PHASES, COMMON_CURRENCIES } from '../constants';
import { Wallet, TrendingDown, Coins, PlusCircle, Users, Tag, ChevronDown, ChevronUp, CreditCard, Banknote, ArrowRight, ArrowDownLeft, History, X, ArrowUpRight, Receipt, CheckCircle, HandHelping, AlertCircle, Ban } from 'lucide-react';
import TravelAdvisoryWidget from './TravelAdvisoryWidget';

interface Props {
  expenses: Expense[];
  companions: Companion[];
  onExport: () => void;
  onAddCash: () => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  currentPhase: Phase;
  taxRule?: TaxRule | null;
  visaInfo?: VisaInfo | null; // Added prop
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

const Dashboard: React.FC<Props> = ({ expenses, companions, onExport, onAddCash, onAddExpense, currentPhase, taxRule, visaInfo }) => {
  const [isRefundListExpanded, setIsRefundListExpanded] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  
  // Wallet History State
  const [viewingWalletCurrency, setViewingWalletCurrency] = useState<string | null>(null);
  
  // Refund Action State
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(PaymentMethod.CREDIT_CARD);

  const { stats, wallet, debts, taxRefundData, creditCardStats, hasRefundRecord, phaseSpecificStats, helpBuyTotal, helpBuyPotentialRefund } = useMemo(() => {
    // 0. Pre-check for Refund Record
    const hasRefund = expenses.some(e => e.description === '退稅入帳 (Tax Refund)' && e.phase === 'post');

    // Global Stats (for Trip Total)
    const s = {
      totalTWD: 0,
      byPhase: { pre: 0, during: 0, post: 0 } as Record<Phase, number>,
      byCategory: {} as Record<string, number>
    };

    // Phase Specific Stats
    const ps = {
        totalTWD: 0,
        byCategory: {} as Record<string, number>
    };

    const w: Record<string, { in: number; refundIn: number; out: number; avgRate: number; totalCostBasis: number }> = {};
    
    const cc = {
        totalTWD: 0,
        byCurrency: {} as Record<string, number>
    };

    const d: Record<string, number> = {}; 
    companions.forEach(c => d[c.id] = 0);

    const refundItems: Expense[] = [];
    let totalEstimatedRefundTWD = 0;
    let totalEstimatedRefundForeign = 0;
    
    let helpBuyTWD = 0;
    let helpBuyPotentialRefund = 0; // Track how much COULD be deducted

    expenses.forEach(e => {
      // Wallet Logic (Money Flow)
      if (e.currency !== 'TWD') {
          if (!w[e.currency]) w[e.currency] = { in: 0, refundIn: 0, out: 0, avgRate: 0, totalCostBasis: 0 };
          
          if (e.category === Category.EXCHANGE) {
             w[e.currency].in += e.amount;
             w[e.currency].totalCostBasis += e.twdAmount;
          } else if (e.paymentMethod === PaymentMethod.CASH_FOREIGN) {
             if (e.amount < 0) {
                 w[e.currency].refundIn += Math.abs(e.amount);
             } else {
                 w[e.currency].out += e.amount;
             }
          }
      }

      // Credit Card Liability Logic (Money Flow)
      if (e.paymentMethod === PaymentMethod.CREDIT_CARD) {
          ccBillAccumulation(cc, e);
      }

      let realCost = 0;
      if (e.category === Category.EXCHANGE) {
        realCost = e.handlingFee || 0;
      } else {
        realCost = e.twdAmount;
      }

      // Check Refund Eligibility Logic (Used for both personal and help buy)
      // Normalize currency check to be case insensitive
      const isEligible = taxRule && 
                         taxRule.refundRate > 0 && // Ensure refund rate is positive
                         e.phase === 'during' && 
                         e.currency.toUpperCase() === taxRule.currency.toUpperCase() && 
                         e.amount >= taxRule.minSpend;

      // Calculate Refund Amount for this item
      let currentRefundForeign = 0;
      let currentRefundTWD = 0;
      if (isEligible && taxRule) {
          currentRefundForeign = e.amount * taxRule.refundRate;
          currentRefundTWD = currentRefundForeign * e.exchangeRate;
          
          // Add to global refund tracker (Display purposes - includes Help Buy)
          refundItems.push(e);
          totalEstimatedRefundForeign += currentRefundForeign;
          totalEstimatedRefundTWD += currentRefundTWD;
      }

      // *** CORE LOGIC ***
      if (e.category === Category.HELP_BUY) {
          // If it is HELP_BUY, track it separately and DO NOT add to Travel Cost Stats
          let itemCost = realCost;
          
          if (isEligible) {
              // Only deduct from receivable IF refund record exists
              if (hasRefund) {
                  itemCost -= currentRefundTWD;
              } else {
                  // Track potential deduction for UI hint
                  helpBuyPotentialRefund += currentRefundTWD;
              }
          }
          helpBuyTWD += itemCost;
      } else {
          // Personal Expense Logic
          s.totalTWD += realCost;
          s.byPhase[e.phase] = (s.byPhase[e.phase] || 0) + realCost;
          s.byCategory[e.category] = (s.byCategory[e.category] || 0) + realCost;

          // Phase Specific Accumulation (Net Cost)
          if (e.phase === currentPhase) {
              ps.totalTWD += realCost;
              ps.byCategory[e.category] = (ps.byCategory[e.category] || 0) + realCost;
          }

          // Debt Logic (Only for shared expenses, Help Buy is treated as separate receivable)
          calculateDebt(e, d, companions);
      }
    });

    Object.keys(w).forEach(curr => {
        if (w[curr].in > 0) {
            w[curr].avgRate = w[curr].totalCostBasis / w[curr].in;
        }
    });

    return { 
        stats: s, 
        wallet: w, 
        creditCardStats: cc,
        debts: d, 
        taxRefundData: { 
            items: refundItems, 
            totalRefundTWD: totalEstimatedRefundTWD, 
            totalRefundForeign: totalEstimatedRefundForeign 
        },
        hasRefundRecord: hasRefund,
        phaseSpecificStats: ps,
        helpBuyTotal: helpBuyTWD,
        helpBuyPotentialRefund
    };
  }, [expenses, companions, taxRule, currentPhase]);

  // Helper functions to keep useMemo clean
  function ccBillAccumulation(cc: any, e: Expense) {
      cc.totalTWD += e.twdAmount;
      if (e.currency !== 'TWD') {
          cc.byCurrency[e.currency] = (cc.byCurrency[e.currency] || 0) + e.amount;
      }
  }

  function calculateDebt(e: Expense, d: Record<string, number>, companions: Companion[]) {
      if (e.category === Category.EXCHANGE) return;
      
      const addDebt = (debtorId: string, amount: number, payer: string) => {
          if (payer === 'me') {
              if (debtorId !== 'me') {
                   d[debtorId] = (d[debtorId] || 0) + amount;
              }
          } else if (payer === debtorId) {
              // Payer paying for themselves
          } else {
              if (debtorId === 'me') {
                   d[payer] = (d[payer] || 0) - amount;
              }
          }
      };

      if (e.splitMethod === 'EQUAL') {
          if (e.beneficiaries && e.beneficiaries.length > 0) {
              const splitAmount = e.twdAmount / e.beneficiaries.length;
              e.beneficiaries.forEach(uid => addDebt(uid, splitAmount as number, e.payerId));
          }
      } else if ((e.splitMethod === 'EXACT' || e.splitMethod === 'PERCENT') && e.splitAllocations) {
          Object.entries(e.splitAllocations).forEach(([uid, amount]) => {
              addDebt(uid, amount as number, e.payerId);
          });
      }
  }

  const isPhaseSpecificView = currentPhase === 'pre' || currentPhase === 'during' || currentPhase === 'post';
  const displayTotal = isPhaseSpecificView ? phaseSpecificStats.totalTWD : stats.totalTWD;
  const displayCategories = isPhaseSpecificView ? phaseSpecificStats.byCategory : stats.byCategory;

  const handleOpenRefundModal = () => {
      if (taxRule) {
          setRefundAmount(Math.floor(taxRefundData.totalRefundForeign).toString());
      }
      setIsRefundModalOpen(true);
  };

  const handleConfirmRefund = () => {
      if (!refundAmount || !taxRule) return;
      const amt = parseFloat(refundAmount);
      if (isNaN(amt) || amt <= 0) return;

      const walletInfo = wallet[taxRule.currency];
      const rate = walletInfo && walletInfo.avgRate > 0 
          ? walletInfo.avgRate 
          : (COMMON_CURRENCIES.find(c => c.code === taxRule.currency)?.defaultRate || 1);

      const twdVal = amt * rate;

      onAddExpense({
          date: new Date().toISOString().split('T')[0],
          description: '退稅入帳 (Tax Refund)',
          amount: -amt, 
          currency: taxRule.currency,
          exchangeRate: rate,
          twdAmount: -twdVal,
          category: Category.OTHER,
          paymentMethod: refundMethod,
          phase: 'post',
          payerId: 'me',
          beneficiaries: ['me'],
          splitMethod: 'EQUAL',
          splitAllocations: {},
          handlingFee: 0
      });

      setIsRefundModalOpen(false);
  };

  const categoryData = Object.entries(displayCategories)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => (b.value as number) - (a.value as number));

  const phaseData = PHASES.map(p => ({
    name: p.label,
    value: stats.byPhase[p.id],
    color: p.id === 'pre' ? '#6366f1' : p.id === 'during' ? '#10b981' : '#f59e0b'
  }));

  const walletCurrencies = Object.keys(wallet).filter(c => wallet[c].in > 0 || wallet[c].refundIn > 0 || wallet[c].out > 0);
  const debtList = Object.entries(debts).filter(([_, amt]) => Math.abs(amt as number) > 1);
  const hasCreditCardUsage = creditCardStats.totalTWD > 0 || Object.keys(creditCardStats.byCurrency).length > 0;

  const walletHistory = useMemo(() => {
    if (!viewingWalletCurrency) return [];
    return expenses
        .filter(e => 
            e.currency === viewingWalletCurrency && 
            (e.category === Category.EXCHANGE || e.paymentMethod === PaymentMethod.CASH_FOREIGN)
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, viewingWalletCurrency]);

  return (
    <div className="space-y-4 mb-6">
      
      {/* Travel Advisory Widget - Show if info exists AND we are in 'pre' phase */}
      {currentPhase === 'pre' && visaInfo && (
          <TravelAdvisoryWidget visaInfo={visaInfo} />
      )}

      {/* Grid wrapper for Status Cards on Tablet/Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Help Buy (Receivable) Card - Only show if > 0 AND NOT PRE PHASE */}
        {helpBuyTotal > 0 && currentPhase !== 'pre' && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-purple-100">
               <div className="flex items-center gap-2 mb-2 border-b border-gray-100 pb-2">
                   <HandHelping size={18} className="text-purple-600" />
                   <h3 className="font-bold text-sm text-gray-700">朋友代買 (應收款)</h3>
               </div>
               <div className="flex justify-between items-end">
                   <div className="text-xs text-gray-500">
                      {hasRefundRecord 
                          ? '已墊付總額 (已扣除退稅)'
                          : '已墊付總額 (尚未扣除退稅)'
                      }
                   </div>
                   <div className="text-xl font-black text-purple-600">
                       NT$ {Math.round(helpBuyTotal).toLocaleString()}
                   </div>
               </div>
               
               {/* Hint about potential refund if not processed yet */}
               {!hasRefundRecord && helpBuyPotentialRefund > 0 && (
                   <div className="mt-2 bg-amber-50 border border-amber-100 p-2 rounded text-[10px] text-amber-700 flex items-start gap-1">
                       <AlertCircle size={12} className="shrink-0 mt-0.5" />
                       <span>
                          若成功辦理退稅，應收款將自動扣除約 
                          <span className="font-bold"> NT$ {Math.round(helpBuyPotentialRefund).toLocaleString()}</span>
                       </span>
                   </div>
               )}

               <div className="mt-2 text-[10px] text-gray-400">
                   * 此金額已計入您的信用卡/現金流出，但不算在您的旅遊花費。
               </div>
            </div>
        )}

        {/* Tax Refund Tracker - Show if taxRule exists and NOT pre phase */}
        {currentPhase !== 'pre' && taxRule && (
            taxRule.refundRate === 0 ? (
                // NO REFUND STATE
                <div className="bg-gray-100 rounded-2xl p-5 border border-gray-200 text-center flex flex-col items-center justify-center gap-2">
                    <div className="bg-gray-200 p-2 rounded-full text-gray-400">
                        <Ban size={24} />
                    </div>
                    <div className="text-gray-500 text-sm font-bold">
                        此國家除了免稅機場消費外，國內消費皆不退稅。
                    </div>
                </div>
            ) : (
                // STANDARD REFUND TRACKER
                <div className={`rounded-2xl p-5 shadow-sm border transition-all ${
                    hasRefundRecord 
                      ? 'bg-emerald-50 border-emerald-200' 
                      : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
                }`}>
                    <div className="flex justify-between items-start mb-2">
                        <div className={`flex items-center gap-2 ${hasRefundRecord ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {hasRefundRecord ? <CheckCircle size={18} /> : <Tag size={18} />}
                            <h3 className="font-bold text-sm tracking-wide">
                                {hasRefundRecord ? '退稅已入帳' : '預估退稅總額'}
                            </h3>
                        </div>
                        <div className="text-right">
                            <div className={`text-2xl font-black leading-none ${hasRefundRecord ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {Math.floor(taxRefundData.totalRefundForeign).toLocaleString()} <span className="text-base font-bold">{taxRule.currency}</span>
                            </div>
                            <div className={`text-xs font-bold mt-1 ${hasRefundRecord ? 'text-emerald-600/60' : 'text-amber-600/60'}`}>
                                ≈ NT$ {Math.round(taxRefundData.totalRefundTWD).toLocaleString()}
                            </div>
                        </div>
                    </div>
                    
                    {!hasRefundRecord && (
                      <div className="text-xs text-amber-700/70 mb-3 flex items-center gap-1">
                          符合 {taxRule.country} 退稅資格 (滿 {taxRule.minSpend.toLocaleString()} {taxRule.currency}) 共 {taxRefundData.items.length} 筆
                      </div>
                    )}

                    {/* Action Button for Post Trip */}
                    {currentPhase === 'post' && (
                        hasRefundRecord ? (
                          <div className="w-full bg-emerald-100 text-emerald-700 py-2 rounded-lg font-bold text-sm mb-0 border border-emerald-200 flex items-center justify-center gap-2 select-none shadow-sm">
                              <CheckCircle size={16} /> 完全退稅 (已入帳)
                          </div>
                        ) : (
                          <button 
                              onClick={handleOpenRefundModal}
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-bold text-sm mb-3 shadow-sm transition-colors flex items-center justify-center gap-2"
                          >
                              <Coins size={16} /> 辦理退稅入帳 (抵銷旅費)
                          </button>
                        )
                    )}

                    {/* Expandable List - Only show if NOT completed (Collapse block) */}
                    {!hasRefundRecord && (
                      <div className="bg-white/60 rounded-xl overflow-hidden border border-amber-100/50">
                          {taxRefundData.items.length > 0 ? (
                              <>
                                  <button 
                                      onClick={() => setIsRefundListExpanded(!isRefundListExpanded)}
                                      className="w-full px-4 py-2 flex items-center justify-between text-xs font-bold text-amber-800 hover:bg-amber-100/50 transition-colors"
                                  >
                                      <span>查看退稅清單與明細</span>
                                      {isRefundListExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </button>
                                  
                                  {isRefundListExpanded && (
                                      <div className="px-4 pb-2 space-y-1 max-h-48 overflow-y-auto">
                                          {taxRefundData.items.map(item => {
                                              const refundAmount = item.amount * (taxRule.refundRate || 0);
                                              return (
                                                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-amber-100 last:border-0 text-xs">
                                                      <div className="flex-1 min-w-0 pr-2">
                                                          <div className="truncate text-gray-700 font-medium">{item.description}</div>
                                                          <div className="text-[10px] text-gray-400">
                                                              消費 {item.amount.toLocaleString()} {item.currency}
                                                          </div>
                                                      </div>
                                                      <div className="text-right whitespace-nowrap">
                                                          <div className="font-mono font-bold text-amber-600">
                                                          + {Math.floor(refundAmount).toLocaleString()} {item.currency}
                                                          </div>
                                                          <div className="text-[10px] text-amber-600/70">
                                                          ≈ NT$ {Math.round(refundAmount * item.exchangeRate).toLocaleString()}
                                                          </div>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  )}
                              </>
                          ) : (
                              <div className="p-3 text-xs text-amber-700/60 text-center font-medium">
                                  尚未有單筆超過 {taxRule.minSpend.toLocaleString()} {taxRule.currency} 的紀錄
                              </div>
                          )}
                      </div>
                    )}
                </div>
            )
        )}

        {/* Wallet Monitor Card */}
        {walletCurrencies.length > 0 && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-2">
                  <div className="flex items-center gap-2">
                      <Wallet size={18} className="text-emerald-400" />
                      <h3 className="font-bold text-sm tracking-wide">外幣現金錢包</h3>
                  </div>
                  <button 
                      onClick={onAddCash}
                      className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded transition-colors"
                  >
                      <PlusCircle size={14} /> 新增/持有外幣
                  </button>
              </div>
              
              <div className="space-y-4">
                  {walletCurrencies.map(curr => {
                      const info = wallet[curr];
                      const remaining = info.in + info.refundIn - info.out;
                      return (
                          <div key={curr} className="bg-white/5 rounded-lg p-3 border border-white/10 relative">
                              <button 
                                  onClick={() => setViewingWalletCurrency(curr)}
                                  className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                  title="查看明細"
                              >
                                  <History size={16} />
                              </button>

                              <div className="flex justify-between items-center mb-2 pr-8">
                                  <div className="flex items-center gap-2">
                                      <span className="font-bold text-lg">{curr}</span>
                                      <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                                          均價: {info.avgRate.toFixed(3)}
                                      </span>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-xs text-gray-400">剩餘現金</div>
                                      <div className={`font-mono font-bold text-xl ${remaining < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                                          {remaining.toLocaleString()}
                                      </div>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                                  <div className="flex items-center gap-1">
                                      <Coins size={12} /> 換匯: {info.in.toLocaleString()}
                                  </div>
                                  <div className="flex items-center gap-1">
                                      <TrendingDown size={12} /> 已用: {info.out.toLocaleString()}
                                  </div>
                                  {info.refundIn > 0 && (
                                      <div className="flex items-center gap-1 text-emerald-400 col-span-2 border-t border-white/10 pt-1 mt-1">
                                          <ArrowDownLeft size={12} /> 退稅加入: {info.refundIn.toLocaleString()}
                                      </div>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
            </div>
        )}

        {/* Credit Card Liability Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-4 border-b border-blue-500/30 pb-2">
                <CreditCard size={18} className="text-blue-200" />
                <h3 className="font-bold text-sm tracking-wide">信用卡累積消費</h3>
            </div>
            
            {hasCreditCardUsage ? (
                <>
                  <div className="flex justify-between items-end mb-4">
                      <div className="text-xs text-blue-200 mb-1">預估帳單總額 (TWD)</div>
                      <div className="text-3xl font-black text-white">
                          NT$ {Math.round(creditCardStats.totalTWD).toLocaleString()}
                      </div>
                  </div>

                  {Object.keys(creditCardStats.byCurrency).length > 0 && (
                      <div className="bg-black/10 rounded-xl p-3 border border-white/5">
                          <div className="text-[10px] text-blue-200 uppercase tracking-wider mb-2 font-bold flex items-center gap-1">
                              <Receipt size={10} /> 外幣刷卡明細 (參考用)
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                              {Object.entries(creditCardStats.byCurrency).map(([curr, amount]) => (
                                  <div key={curr} className="flex justify-between items-center text-xs">
                                      <span className="font-bold text-blue-100">{curr}</span>
                                      <span className="font-mono text-white">{amount.toLocaleString()}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                </>
            ) : (
              <div className="text-center py-4 text-blue-200/60 text-xs">
                  <p>尚無信用卡消費紀錄</p>
                  <p>記帳時選擇「信用卡」即可在此累計</p>
              </div>
            )}
        </div>

        {/* Split Bill / Debt Card - Only visible if companions exist */}
        {companions.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100 md:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
                  <Users size={18} className="text-indigo-600" />
                  <h3 className="font-bold text-sm text-gray-700">分帳結算 (相對於我)</h3>
              </div>
              {debtList.length > 0 ? (
                  <div className="space-y-3">
                      {debtList.map(([id, rawAmount]) => {
                          const amount = rawAmount as number;
                          const name = companions.find(c => c.id === id)?.name || '未知';
                          return (
                              <div key={id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                  <span className="font-medium text-gray-800">{name}</span>
                                  {amount > 0 ? (
                                      <span className="text-green-600 font-bold text-sm">欠我 NT$ {Math.round(amount).toLocaleString()}</span>
                                  ) : (
                                      <span className="text-red-500 font-bold text-sm">我欠他 NT$ {Math.abs(Math.round(amount)).toLocaleString()}</span>
                                  )}
                              </div>
                          );
                      })}
                  </div>
              ) : (
                  <div className="text-center text-xs text-gray-400 py-2">目前沒有需要結算的款項</div>
              )}
            </div>
        )}

      </div> 
      {/* End Grid Wrapper */}

      {/* Main Stats Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mt-0">
        <div className="flex justify-between items-start mb-6">
            <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                {currentPhase === 'pre' ? '旅行前支出總計' : currentPhase === 'during' ? '旅行中支出總計' : '回國機場消費總計'}
            </h2>
            <div className="text-xs text-gray-400 mt-0.5">
                {currentPhase === 'pre' ? '(僅計算行前準備費用)' : currentPhase === 'during' ? '(僅計算旅途當下消費)' : '(僅計算回國機場消費)'}
            </div>
            <div className="text-4xl font-black text-brand-900 mt-1">
                NT$ {Math.round(displayTotal).toLocaleString()}
            </div>
            </div>
            <button onClick={onExport} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded-md">
                匯出 CSV
            </button>
        </div>

        <div className={`grid ${isPhaseSpecificView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
            {/* Phase Chart - Hide if Pre/During/Post trip view */}
            {!isPhaseSpecificView && (
                <div className="h-48 relative">
                    <h3 className="text-xs font-bold text-gray-400 absolute top-0 left-0">階段分佈</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={phaseData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" tick={{fontSize: 12}} width={50} />
                        <Tooltip formatter={(value: number) => `NT$ ${Math.round(value).toLocaleString()}`} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {phaseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Category Chart */}
            <div className="h-48 relative">
            <h3 className="text-xs font-bold text-gray-400 absolute top-0 left-0">
                {currentPhase === 'pre' ? '行前花費類別' : currentPhase === 'during' ? '旅途花費類別' : '機場消費類別'}
            </h3>
            {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="value"
                    >
                    {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `NT$ ${Math.round(value).toLocaleString()}`} />
                </PieChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-300 text-sm">尚無資料</div>
            )}
            </div>
        </div>
      </div>

      {/* ... Modals (Refund, Wallet) ... */}
      {isRefundModalOpen && taxRule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <Coins className="text-amber-500" /> 辦理退稅入帳
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    系統將新增一筆「負向支出」，用以抵銷您的旅費總額。
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">實際收到退稅金額 ({taxRule.currency})</label>
                        <input 
                            type="number" 
                            autoFocus
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-mono font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2">退款方式</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setRefundMethod(PaymentMethod.CREDIT_CARD)}
                                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${refundMethod === PaymentMethod.CREDIT_CARD ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                                <CreditCard size={24} />
                                <span className="text-xs font-bold">退到信用卡</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRefundMethod(PaymentMethod.CASH_FOREIGN)}
                                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${refundMethod === PaymentMethod.CASH_FOREIGN ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                                <Banknote size={24} />
                                <span className="text-xs font-bold">領取外幣現金</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button 
                            onClick={() => setIsRefundModalOpen(false)}
                            className="flex-1 py-3 text-gray-500 font-bold bg-gray-100 rounded-xl hover:bg-gray-200"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleConfirmRefund}
                            disabled={!refundAmount || parseFloat(refundAmount) <= 0}
                            className="flex-1 py-3 text-white font-bold bg-amber-500 rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                             確認入帳 <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
             </div>
        </div>
      )}

      {/* Wallet History Modal */}
      {viewingWalletCurrency && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b bg-emerald-600 text-white flex justify-between items-center shrink-0">
                      <h2 className="font-bold flex items-center gap-2">
                          <History size={20} /> {viewingWalletCurrency} 錢包明細
                      </h2>
                      <button onClick={() => setViewingWalletCurrency(null)} className="p-1 hover:bg-white/20 rounded-full">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-0 overflow-y-auto bg-gray-50 flex-1">
                      {walletHistory.length > 0 ? (
                          <div className="divide-y divide-gray-100">
                              {walletHistory.map(item => {
                                  const isFlowIn = item.category === Category.EXCHANGE || item.amount < 0;
                                  const displayAmount = Math.abs(item.amount);
                                  
                                  return (
                                      <div key={item.id} className="p-4 bg-white hover:bg-gray-50 flex justify-between items-center">
                                          <div className="flex items-center gap-3">
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isFlowIn ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                                  {isFlowIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-gray-800 text-sm line-clamp-1">{item.description}</div>
                                                  <div className="text-xs text-gray-400">{item.date} • {item.category}</div>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div className={`font-mono font-bold ${isFlowIn ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                  {isFlowIn ? '+' : '-'}{displayAmount.toLocaleString()}
                                              </div>
                                              {item.currency !== 'TWD' && (
                                                  <div className="text-[10px] text-gray-400">
                                                      ≈ NT$ {Math.abs(Math.round(item.twdAmount)).toLocaleString()}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      ) : (
                          <div className="text-center py-10 text-gray-400">
                              <p>尚無現金流動紀錄</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
