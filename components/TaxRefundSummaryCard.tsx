import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { DuringRefundState, RefundCandidate } from '../services/duringRefundState';

interface Props { refundState: DuringRefundState; onSettleRefund: () => void; returnContext?: boolean; }

const TaxRefundSummaryCard: React.FC<Props> = ({ refundState, onSettleRefund, returnContext = false }) => {
  const [expanded, setExpanded] = useState(false);
  const eligible = 'eligibleItems' in refundState ? refundState.eligibleItems : [];
  const rows: RefundCandidate[] = eligible.length
    ? eligible
    : ('belowThresholdItems' in refundState ? refundState.belowThresholdItems : []);
  /** True when these rows are the ones that qualify, rather than the ones that do not. */
  const rowsQualify = eligible.length > 0;
  const source = 'ruleSource' in refundState ? refundState.ruleSource : undefined;
  const refundCurrency = 'currency' in refundState ? refundState.currency : '';
  const threshold = 'threshold' in refundState ? refundState.threshold : 0;
  const estimate = refundState.status === 'estimate_available';
  const title = refundState.status === 'no_rule' ? '退稅資格待確認' : refundState.status === 'below_threshold' ? '尚未達退稅門檻' : refundState.status === 'threshold_met' ? '已達退稅門檻' : source === 'model_knowledge' ? 'AI 預估退稅' : '預估退稅總額';
  return <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-amber-800"><Tag size={18} /><h3 className="text-sm font-bold tracking-wide">{title}</h3></div>{estimate && <div className="text-right text-2xl font-black text-amber-700">{Math.floor(refundState.estimatedRefund).toLocaleString()} {refundState.currency}</div>}</div>
    {refundState.status === 'no_rule' && <p className="mt-3 text-xs text-amber-800">目前無法安全估算退稅金額。</p>}
    {/*
      The rule itself, before anyone has bought anything.

      「剛剛點開還是沒有退稅資訊」: the card only ever reported a status, so a
      traveller the day before flying — with no purchases yet — was told 「尚未
      達退稅門檻」 and never the threshold they were under or the rate they could
      expect. That is the part you need in the shop.
    */}
    {'threshold' in refundState && (
      <p data-testid="refund-rule" className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs font-bold text-amber-900">
        單筆滿 {refundState.threshold.toLocaleString()} {refundState.currency} 可退稅
        {refundState.refundRate !== undefined && `・概估可退約 ${Math.round(refundState.refundRate * 100)}%`}
      </p>
    )}
    {refundState.status === 'below_threshold' && <p className="mt-2 text-xs text-amber-800">目前購物金額：{refundState.shoppingSpend.toLocaleString()} {refundState.currency}</p>}
    {(estimate || refundState.status === 'threshold_met') && <p className="mt-2 text-xs font-bold text-amber-800">符合 {eligible.length} 筆目前估算條件</p>}
    {estimate && <p className="mt-3 text-[11px] leading-5 text-amber-800/70">{source === 'model_knowledge' ? '此為 AI 依目前旅行規則資訊估算，實際退稅資格與金額依商家及最新官方規定為準。' : '依目前查得規則估算，實際退稅資格與金額依商家、商品類別及現場規定為準。'}</p>}
    {rows.length > 0 && <div className="mt-3 overflow-hidden rounded-xl border border-amber-100 bg-white/60"><button onClick={() => setExpanded(v => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-amber-800">{rowsQualify ? '查看退稅清單與明細' : '查看購物明細'} {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expanded && <div className="divide-y divide-amber-100 px-3">
      {/*
        「退稅的金額要寫在該項目旁邊 加總的在上面」.

        The purchase stays, quietly, because it is how you recognise the row —
        but the number in bold is the one the list is about. Both come from the
        same arithmetic as the headline, so the rows add up to it.
      */}
      {rows.map(item => (
        <div key={item.expense.id} data-testid={`refund-row-${item.expense.id}`} className="flex items-start justify-between gap-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-amber-900">{item.expense.description}</span>
            <span className="mt-0.5 block text-[10px] text-amber-700/60">
              {Math.round(item.amount).toLocaleString()} {refundCurrency}
            </span>
          </span>
          {/*
            A row that does not qualify shows what it is short by, not a refund
            it will not get. Printing an estimate beside 未達門檻 would be the
            card arguing with itself.
          */}
          <b className="shrink-0 whitespace-nowrap text-amber-700">
            {!rowsQualify
              ? <span className="text-amber-700/60">還差 {Math.max(0, Math.ceil(threshold - item.amount)).toLocaleString()}</span>
              : item.refund === undefined
                ? '—'
                : `+${Math.floor(item.refund).toLocaleString()} ${refundCurrency}`}
          </b>
        </div>
      ))}
    </div>}</div>}
    {estimate && <button onClick={onSettleRefund} className="mt-3 w-full rounded-lg bg-amber-500 py-2 text-sm font-bold text-white">辦理退稅入帳{returnContext ? '（抵銷旅費）' : ''}</button>}
  </section>;
};
export default TaxRefundSummaryCard;
