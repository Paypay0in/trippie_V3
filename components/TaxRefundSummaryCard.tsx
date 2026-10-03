import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { DuringRefundState, RefundCandidate } from '../services/duringRefundState';

interface Props {
  refundState: DuringRefundState;
  onSettleRefund: () => void;
  returnContext?: boolean;
  /**
   * Marks one purchase as already refunded at the till, or unmarks it.
   *
   * 「要讓我每筆都點選已經扣除」 — Korea's 즉시환급 settles the refund at the
   * counter, and those purchases must leave the airport estimate. Omit to render
   * the list read-only.
   */
  onToggleRefundedAtPurchase?: (expenseId: string, refunded: boolean) => void;
  /**
   * Records what the refund actually came to for one purchase.
   *
   * 「如果按下去 可以輸入正確退稅金額」 — an estimate is the app's arithmetic, this
   * is what the counter handed back. Pass `undefined` to clear it.
   */
  onRecordActualRefund?: (expenseId: string, actual: number | undefined) => void;
}

const TaxRefundSummaryCard: React.FC<Props> = ({ refundState, onSettleRefund, returnContext = false, onToggleRefundedAtPurchase, onRecordActualRefund }) => {
  const [expanded, setExpanded] = useState(false);
  /** The row whose actual amount is being typed, and what has been typed. */
  const [editingActualFor, setEditingActualFor] = useState<string | null>(null);
  const [actualDraft, setActualDraft] = useState('');

  const openActualEntry = (expenseId: string, current?: number) => {
    setEditingActualFor(expenseId);
    setActualDraft(current === undefined ? '' : String(Math.round(current)));
  };

  const commitActual = (expenseId: string) => {
    const typed = actualDraft.trim();
    // An empty box clears the figure rather than storing a zero: 「我沒記」 and
    // 「退了 0 元」 are different answers and only one of them is usually true.
    const value = typed === '' ? undefined : Number(typed.replace(/,/g, ''));
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return;
    onRecordActualRefund?.(expenseId, value);
    setEditingActualFor(null);
    setActualDraft('');
  };
  const eligible = 'eligibleItems' in refundState ? refundState.eligibleItems : [];
  const rows: RefundCandidate[] = eligible.length
    ? eligible
    : ('belowThresholdItems' in refundState ? refundState.belowThresholdItems : []);
  /** True when these rows are the ones that qualify, rather than the ones that do not. */
  const rowsQualify = eligible.length > 0;
  const source = 'ruleSource' in refundState ? refundState.ruleSource : undefined;
  const refundCurrency = 'currency' in refundState ? refundState.currency : '';
  const threshold = 'threshold' in refundState ? refundState.threshold : 0;
  /** Purchases the shop already refunded, kept visible so a tick is not a disappearance. */
  const settled = 'settledItems' in refundState ? refundState.settledItems : [];
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
    {/*
      How much of that headline is a receipt and how much is arithmetic.

      A card that folds a confirmed figure and a guess into one number without
      saying so is claiming to know more than it does.
    */}
    {estimate && refundState.confirmedRefund > 0 && (
      <p data-testid="refund-confirmed-split" className="mt-2 text-xs font-bold text-amber-800">
        其中 {Math.round(refundState.confirmedRefund).toLocaleString()} {refundState.currency} 是你已確認收到的金額
      </p>
    )}
    {/*
      The receipts and the looked-up rule disagree. Said, not silently applied:
      a handful of receipts is not the regulation, and overwriting a researched
      rule with them would be the wrong direction — but continuing to estimate
      with a rate the traveller's own refunds keep contradicting is worse.
    */}
    {estimate && refundState.ruleLooksWrong && (
      <p data-testid="refund-rule-disagrees" className="mt-2 rounded-xl bg-white/60 px-3 py-2 text-[11px] font-bold leading-5 text-amber-900">
        你實際收到的退稅和查到的比例不太一樣，下面的估算已改用你自己的 {refundState.observationCount} 筆紀錄推算。
      </p>
    )}
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
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {/* 「要讓我每筆都點選已經扣除」, where the purchase is listed. */}
              {onToggleRefundedAtPurchase && (
                <button
                  type="button"
                  data-testid={`mark-refunded-${item.expense.id}`}
                  onClick={() => onToggleRefundedAtPurchase(item.expense.id, true)}
                  className="rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                >
                  結帳時已退稅
                </button>
              )}
              {/*
                The figure the counter actually handed back.

                「如果按下去 可以輸入正確退稅金額」 — once it is in, this row stops
                estimating and the headline says how much of itself is confirmed.
              */}
              {onRecordActualRefund && editingActualFor !== item.expense.id && (
                <button
                  type="button"
                  data-testid={`enter-actual-${item.expense.id}`}
                  onClick={() => openActualEntry(item.expense.id, item.actualRefund)}
                  className="rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                >
                  {item.actualRefund === undefined ? '填入實際退稅' : '修改實際金額'}
                </button>
              )}
              {onRecordActualRefund && editingActualFor === item.expense.id && (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    inputMode="numeric"
                    aria-label={`${item.expense.description} 實際退稅金額`}
                    data-testid={`actual-input-${item.expense.id}`}
                    value={actualDraft}
                    onChange={event => setActualDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') commitActual(item.expense.id); }}
                    placeholder={refundCurrency}
                    className="w-20 rounded-md border border-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 outline-none"
                  />
                  <button
                    type="button"
                    data-testid={`save-actual-${item.expense.id}`}
                    onClick={() => commitActual(item.expense.id)}
                    className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white"
                  >
                    存
                  </button>
                </span>
              )}
            </span>
          </span>
          {/*
            A row that does not qualify shows what it is short by, not a refund
            it will not get. Printing an estimate beside 未達門檻 would be the
            card arguing with itself.
          */}
          {/*
            A fact replaces the arithmetic. An estimate is what the app worked
            out; this is what the counter paid, so it is not averaged with the
            guess, it supersedes it — and it says so, because a reader cannot
            otherwise tell which of the two they are looking at.
          */}
          <b className="shrink-0 whitespace-nowrap text-right text-amber-700">
            {!rowsQualify
              ? <span className="text-amber-700/60">還差 {Math.max(0, Math.ceil(threshold - item.amount)).toLocaleString()}</span>
              : item.actualRefund !== undefined
                ? (
                  <span className="block">
                    +{Math.round(item.actualRefund).toLocaleString()} {refundCurrency}
                    <span className="mt-0.5 block text-[9px] font-bold text-emerald-600">實際</span>
                  </span>
                )
                : item.refund === undefined
                  ? '—'
                  : `+${Math.floor(item.refund).toLocaleString()} ${refundCurrency}`}
          </b>
        </div>
      ))}
    </div>}</div>}

    {/*
      Already settled at the till.

      Listed rather than dropped: the traveller ticked these, and a list that
      quietly loses the row they just tapped looks like it failed. They are out
      of the estimate above — that is the whole point — so they are shown apart
      from it, and a mistaken tick is one tap to undo.
    */}
    {settled.length > 0 && (
      <div data-testid="settled-at-purchase" className="mt-3 rounded-xl bg-white/60 px-3 py-2">
        <p className="text-[11px] font-black text-amber-800">結帳時已退稅 · {settled.length} 筆（不列入上方估算）</p>
        <div className="mt-1 divide-y divide-amber-100">
          {settled.map(item => (
            <div key={item.expense.id} data-testid={`settled-row-${item.expense.id}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-amber-900/70 line-through">{item.expense.description}</span>
              <span className="shrink-0 text-[10px] text-amber-700/60">{Math.round(item.amount).toLocaleString()} {refundCurrency}</span>
              {onToggleRefundedAtPurchase && (
                <button
                  type="button"
                  data-testid={`unmark-refunded-${item.expense.id}`}
                  onClick={() => onToggleRefundedAtPurchase(item.expense.id, false)}
                  className="shrink-0 text-[10px] font-bold text-amber-700 underline underline-offset-2"
                >
                  取消
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
    {estimate && <button onClick={onSettleRefund} className="mt-3 w-full rounded-lg bg-amber-500 py-2 text-sm font-bold text-white">辦理退稅入帳{returnContext ? '（抵銷旅費）' : ''}</button>}
  </section>;
};
export default TaxRefundSummaryCard;
