import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { Expense } from '../types';
import { DuringRefundState } from '../services/duringRefundState';

interface Props { refundState: DuringRefundState; onSettleRefund: () => void; returnContext?: boolean; }

const TaxRefundSummaryCard: React.FC<Props> = ({ refundState, onSettleRefund, returnContext = false }) => {
  const [expanded, setExpanded] = useState(false);
  const eligible = 'eligibleExpenses' in refundState ? refundState.eligibleExpenses : [];
  const rows: Expense[] = eligible.length ? eligible : ('belowThresholdExpenses' in refundState ? refundState.belowThresholdExpenses : []);
  const source = 'ruleSource' in refundState ? refundState.ruleSource : undefined;
  const estimate = refundState.status === 'estimate_available';
  const title = refundState.status === 'no_rule' ? '退稅資格待確認' : refundState.status === 'below_threshold' ? '尚未達退稅門檻' : refundState.status === 'threshold_met' ? '已達退稅門檻' : source === 'model_knowledge' ? 'AI 預估退稅' : '預估退稅總額';
  return <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-amber-800"><Tag size={18} /><h3 className="text-sm font-bold tracking-wide">{title}</h3></div>{estimate && <div className="text-right text-2xl font-black text-amber-700">{Math.floor(refundState.estimatedRefund).toLocaleString()} {refundState.currency}</div>}</div>
    {refundState.status === 'no_rule' && <p className="mt-3 text-xs text-amber-800">目前無法安全估算退稅金額。</p>}
    {refundState.status === 'below_threshold' && <p className="mt-3 text-xs text-amber-800">目前購物金額：{refundState.shoppingSpend.toLocaleString()} {refundState.currency} · 退稅門檻：{refundState.threshold.toLocaleString()} {refundState.currency}</p>}
    {(estimate || refundState.status === 'threshold_met') && <p className="mt-2 text-xs font-bold text-amber-800">符合 {eligible.length} 筆目前估算條件</p>}
    {estimate && <p className="mt-3 text-[11px] leading-5 text-amber-800/70">{source === 'model_knowledge' ? '此為 AI 依目前旅行規則資訊估算，實際退稅資格與金額依商家及最新官方規定為準。' : '依目前查得規則估算，實際退稅資格與金額依商家、商品類別及現場規定為準。'}</p>}
    {rows.length > 0 && <div className="mt-3 overflow-hidden rounded-xl border border-amber-100 bg-white/60"><button onClick={() => setExpanded(v => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-amber-800">查看退稅清單與明細 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expanded && <div className="divide-y divide-amber-100 px-3">{rows.map(e => <div key={e.id} className="flex justify-between py-2 text-xs"><span>{e.description}</span><b>{e.amount.toLocaleString()} {e.currency}</b></div>)}</div>}</div>}
    {estimate && <button onClick={onSettleRefund} className="mt-3 w-full rounded-lg bg-amber-500 py-2 text-sm font-bold text-white">辦理退稅入帳{returnContext ? '（抵銷旅費）' : ''}</button>}
  </section>;
};
export default TaxRefundSummaryCard;
