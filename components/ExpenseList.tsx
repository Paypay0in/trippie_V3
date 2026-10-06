
import React from 'react';
import { Expense, Category, TaxRule, TripMember } from '../types';
import { getCategoryIcon } from '../constants';
import { Tag, ArrowDownLeft, AlertTriangle, Users, ChevronRight } from 'lucide-react';
import { MessageCircleQuestion } from 'lucide-react';
import { initialOf, summariseExpenseRow, toneForMember } from '../services/expenseRowSummary';
import { fromLocalIsoDate } from '../services/localDate';
import { canDeleteExpense, canEditExpense } from '../services/expensePermissions';
import { canRaiseDispute, getOpenDisputes } from '../services/expenseDisputes';
import { partitionByConcern } from '../services/expenseConcernsMember';
import { calculateExpenseLedger } from '../services/splitCalculator';
import { expenseNetAmount, refundReceivedInTwd } from '../services/viewerSpend';
import { qualifiesForRefund } from '../services/refundHint';
import { CustomCategoryRefundability } from '../services/refundableCustomCategories';

interface Props {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  taxRule?: TaxRule | null;
  /** What the traveller has said about their own categories. */
  refundableCustomCategories?: CustomCategoryRefundability;
  /**
   * Who is looking at the ledger, and who owns the trip. Optional so existing
   * single-user call sites keep working; when both are given, edit/delete
   * actions follow the ownership contract in services/expensePermissions.
   */
  viewerMemberId?: string;
  tripOwnerMemberId?: string;
  /** Opens the dispute thread for an expense. Omit to hide the entry. */
  onOpenDisputes?: (expense: Expense) => void;
  /**
   * The travellers, for the payer line the design asks each row to carry.
   * Without them a row still renders; it just cannot name who paid.
   */
  members?: TripMember[];
}

const ExpenseList: React.FC<Props> = ({
  expenses,
  onDelete,
  onEdit,
  taxRule,
  refundableCustomCategories = {},
  viewerMemberId,
  tripOwnerMemberId,
  onOpenDisputes,
  members = [],
}) => {
  const [othersShown, setOthersShown] = React.useState(false);
  /** A receipt opened full size, because a 40-pixel crop cannot be read. */
  const [viewingReceipt, setViewingReceipt] = React.useState<string | null>(null);
  /**
   * What this bill cost the viewer, where the app knows who they are.
   *
   * 「分帳完 我只出一半 所以 12000 我只花 6000」 — the row showed the whole bill
   * and the day subtotalled all of it, both of them money that passed through
   * the reader rather than money they spent.
   *
   * Guarded on both ends. A bill with no TWD amount drove the split calculator
   * into a loop that pinned a core until it was killed, and an unsplit bill has
   * no share to state — asking is pure cost.
   */
  const shareOf = (expense: Expense): number | undefined => {
    if (!viewerMemberId) return undefined;
    if (!Number.isFinite(expense.twdAmount)) return undefined;
    const { responsibility } = calculateExpenseLedger(expense, tripOwnerMemberId);
    const share = responsibility[viewerMemberId];
    return Number.isFinite(share) ? share : undefined;
  };
  // Without an identity pair we cannot decide ownership, so we keep the
  // existing single-user behavior. The handler in App enforces permission
  // regardless of what is rendered here.
  const permissionsKnown = Boolean(viewerMemberId && tripOwnerMemberId);
  const mayEdit = (expense: Expense) =>
    !permissionsKnown ||
    canEditExpense({
      expense,
      viewerMemberId: viewerMemberId as string,
      tripOwnerMemberId: tripOwnerMemberId as string,
    });
  const mayDelete = (expense: Expense) =>
    !permissionsKnown ||
    canDeleteExpense({
      expense,
      viewerMemberId: viewerMemberId as string,
      tripOwnerMemberId: tripOwnerMemberId as string,
    });

  // The dispute entry is the outlet for members who may not edit or delete.
  // It also stays visible once questions exist, so a thread is never hidden
  // from the people it concerns.
  const openDisputeCount = (expense: Expense) =>
    permissionsKnown ? getOpenDisputes(expense).length : 0;
  // The pencil is for the creator only. A member with an objection goes through
  // 提出疑問, which carries the split breakdown and offers the same form from
  // inside — two buttons that both mean "I disagree" only look like a choice.
  const mayOpenForm = (expense: Expense) => mayEdit(expense);
  const mayRaiseDispute = (expense: Expense) =>
    Boolean(onOpenDisputes) &&
    permissionsKnown &&
    canRaiseDispute({
      expense,
      viewerMemberId: viewerMemberId as string,
      tripOwnerMemberId: tripOwnerMemberId as string,
    }).allowed;
  const mayDispute = (expense: Expense) =>
    mayRaiseDispute(expense) ||
    (Boolean(onOpenDisputes) && openDisputeCount(expense) > 0);

  /**
   * A shared ledger is not a shared feed.
   *
   * 「這個帳若不是我花費的，根本不需要出現在我的帳上」，and sharper: 「我也沒有
   * 想看到他的帳啊」. What the traveller has to settle belongs here; what the
   * other person bought for themselves does not, and putting it in this list
   * only makes their own ledger harder to read.
   *
   * It is folded away rather than dropped. An earlier version of this filtered
   * the list outright and a bill the other traveller had explicitly split
   * vanished the night before they flew — hiding money is the one failure this
   * app cannot afford. Everything is still one tap away, and every total on
   * every screen still counts all of it.
   */
  const { mine, others } = partitionByConcern(expenses, viewerMemberId);
  const visible = othersShown ? expenses : mine;

  if (expenses.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p>此階段尚無支出紀錄</p>
        <p className="text-xs mt-2">點擊下方按鈕新增一筆</p>
      </div>
    );
  }

  // 1. Group expenses by Date
  const groupedByDate = visible.reduce((acc, expense) => {
    const dateKey = expense.date; // "YYYY-MM-DD"
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(expense);
    return acc;
  }, {} as Record<string, Expense[]>);

  // 2. Sort dates descending (Newest first)
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  /*
    The weekday of a calendar date, read on the local calendar.

    `new Date('2026-10-02')` is parsed as UTC midnight and then asked for its
    local day, so west of Greenwich every date on the ledger wore the name of
    the day before. In Busan it happened to read correctly, which is exactly the
    kind of bug that ships.
  */
  const getDayLabel = (dateStr: string) => {
    const date = fromLocalIsoDate(dateStr);
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return Number.isNaN(date.getTime()) ? '' : days[date.getDay()];
  };

  return (
    <div className="space-y-6 pb-24">
      {viewingReceipt && (
        <div
          role="dialog"
          aria-label="收據"
          data-testid="list-receipt-viewer"
          onClick={() => setViewingReceipt(null)}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
        >
          <img src={viewingReceipt} alt="收據" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
      {sortedDates.map((date) => {
        const dayExpenses = groupedByDate[date];
        // Calculate daily total for easier checking (Net total)
        const dailyTotal = dayExpenses.reduce((sum, item) => sum + item.twdAmount, 0);
        const dailyShare = dayExpenses.reduce((sum, item) => sum + (shareOf(item) ?? item.twdAmount), 0);

        return (
          <div key={date} className="animate-fade-in-up">
            {/* The day, and what it cost this traveller. */}
            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-slate-100/80 px-3 py-2.5">
                <span className="text-base font-black tracking-tight text-[#11183d]">
                    {date.slice(5).replace('-', '/')}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    {getDayLabel(date)}
                </span>
                <span className="ml-auto text-[11px] font-bold text-slate-400">
                    {Math.round(dailyShare) === Math.round(dailyTotal) ? '小計' : '你的小計'}
                </span>
                <span className="text-sm font-black text-[#11183d]">
                    TWD {Math.round(dailyShare).toLocaleString()}
                </span>
            </div>

            {/* Expenses for this date */}
            <div className="space-y-3">
                {dayExpenses.map((item) => {
                    // Detect if this is an Income/Refund (Negative Amount)
                    const isIncome = item.amount < 0;
                    const Icon = isIncome ? ArrowDownLeft : getCategoryIcon(item.category);

                    /*
                      Still worth carrying to the counter.

                      「這幾個不符合退稅資格 我有標記 但你黃色標籤依然標退稅資格」 —
                      this row had its own copy of the rule, and that copy knew
                      nothing about 不可退稅, nothing about 結帳時已退稅, and
                      nothing about the five other categories a bought thing
                      lands in. It went on promising a refund on purchases the
                      traveller had already ruled out.

                      One rule, shared with the estimate: a row that says 退稅
                      資格 is a row inside the total on the refund card.
                    */
                    const isRefundable = !isIncome && qualifiesForRefund(item, taxRule, refundableCustomCategories);

                    const summary = summariseExpenseRow(item, members, viewerMemberId, tripOwnerMemberId);
                    const { payer, involved, isPersonal, sharerCount, viewerShare } = summary;
                    // A refund already received comes off what this bill cost.
                    const refunded = refundReceivedInTwd(item);
                    const netAmount = expenseNetAmount(item);
                    const isSplit = sharerCount > 1;
                    /*
                      One tap target instead of a row of small ones.

                      The design ends each row with a chevron, and the cluster of
                      pencil, bin and 提出疑問 it replaces is what crowded the
                      middle column in the first place. Nothing becomes
                      unreachable: the form carries 刪除這筆支出, and a member who
                      may not edit still lands on the thread where they can ask.
                    */
                    const open = mayOpenForm(item)
                        ? () => onEdit(item)
                        : mayDispute(item)
                            ? () => onOpenDisputes?.(item)
                            : undefined;

                    return (
                    <div
                        key={item.id}
                        data-testid={`expense-row-${item.id}`}
                        className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 transition-colors ${
                            isIncome
                                ? 'border-emerald-100 bg-emerald-50/50'
                                : isPersonal
                                    ? 'border-emerald-200 bg-emerald-50/60'
                                    : 'border-slate-100 bg-white'
                        }`}
                    >
                        {isRefundable && <div className="absolute bottom-0 left-0 top-0 w-1 bg-amber-400" />}

                        {/*
                          The receipt, at the size of a thumbnail rather than a glyph.

                          「若有上傳照片 縮圖顯示在這」 — a row of identical circles names
                          the kind of expense, which the title already says. The
                          photograph says which bill this is, and it is the thing
                          you scan a list for.
                        */}
                        {(item.receiptPhotos?.length ?? 0) > 0 ? (
                            <button
                                type="button"
                                onClick={() => setViewingReceipt(item.receiptPhotos?.[0] ?? null)}
                                aria-label={`放大 ${item.description || '這筆支出'} 的收據`}
                                data-testid={`row-receipt-${item.id}`}
                                className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200"
                            >
                                <img src={item.receiptPhotos?.[0]} alt="收據" className="h-full w-full object-cover" />
                            </button>
                        ) : (
                            <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl ${
                                isIncome
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : isPersonal
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : item.category === Category.EXCHANGE
                                            ? 'bg-orange-100 text-orange-600'
                                            : 'bg-brand-50 text-brand-500'
                            }`}>
                                <Icon size={22} />
                            </div>
                        )}

                        <div className="min-w-0 flex-1">
                            {/* truncate belongs on the text, not on the flex box around it. */}
                            <h4 className={`flex min-w-0 items-center gap-2 text-base font-black ${isIncome ? 'text-emerald-900' : 'text-[#11183d]'}`}>
                                <span className="min-w-0 truncate">{item.description}</span>
                                {item.needsReview && (
                                    <span className="flex shrink-0 items-center gap-1 rounded border border-yellow-200 bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700">
                                        <AlertTriangle size={10} /> 待確認
                                    </span>
                                )}
                            </h4>

                            {/*
                              Tags wrap inside their own column, never over it.

                              「帳目標題被截掉 數字也跑版」: each tag is nowrap, and with
                              the action cluster beside them the middle column had
                              almost no width left, so the row ran its tags straight
                              across the amount.
                            */}
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 overflow-hidden text-xs">
                                <span className={`flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold ${
                                    isIncome
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : isPersonal
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-rose-50 text-rose-600'
                                }`}>
                                    <Icon size={11} />
                                    {isIncome ? '退稅入帳' : isPersonal ? '個人支出' : item.category}
                                </span>
                                {isRefundable && (
                                    <span data-testid={`refund-eligible-${item.id}`} className="flex items-center gap-0.5 whitespace-nowrap rounded-md border border-amber-200 bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">
                                        <Tag size={10} /> 退稅資格
                                    </span>
                                )}
                            </div>

                            {/* Who put the money down, and who it touches. */}
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
                                {involved.length > 0 && (
                                    <span className="flex shrink-0 -space-x-1.5">
                                        {involved.slice(0, 3).map(member => (
                                            <span
                                                key={member.id}
                                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ring-2 ring-white ${
                                                    isPersonal ? 'bg-emerald-100 text-emerald-700' : toneForMember(members, member.id)
                                                }`}
                                            >
                                                {isPersonal ? '我' : initialOf(member)}
                                            </span>
                                        ))}
                                    </span>
                                )}
                                <span className={`min-w-0 truncate text-[11px] font-bold ${isPersonal ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {isPersonal
                                        ? '我自己付・不分帳'
                                        : payer
                                            ? `${payer.id === viewerMemberId ? '你' : payer.name} 先付`
                                            : ''}
                                </span>
                                {mayDispute(item) && openDisputeCount(item) > 0 && (
                                    <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                        <MessageCircleQuestion size={10} /> {openDisputeCount(item)}
                                    </span>
                                )}
                            </div>

                            {/*
                              Whatever the traveller wrote about this bill.

                              A note nobody can see is a note nobody writes a
                              second time, so it reads on the row rather than
                              only inside the edit sheet. Clamped to two lines:
                              the row is a list entry, and the whole note is one
                              tap away.
                            */}
                            {item.note && (
                                <p data-testid={`expense-note-${item.id}`} className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
                                    {item.note}
                                </p>
                            )}
                        </div>

                        {/* The amount, against a hairline, as the design has it. */}
                        <div className="flex shrink-0 items-center gap-1 self-stretch border-l border-slate-100 pl-3 text-right">
                            <div className="whitespace-nowrap">
                                {/*
                                  What the bill came to after anything already refunded.

                                  「若是在結帳時已退稅，要回頭去去掉該筆帳的總額」 — money
                                  handed back at the till never left, so the sticker
                                  price is not what this cost. The original stays
                                  above it, struck through: a row that silently shows
                                  a number matching neither the receipt nor the card
                                  is a row nobody can reconcile.
                                */}
                                {/*
                                  On a shared bill, your share is the headline.

                                  「反過來 1.放大我分帳金額 2.將總額放下方縮小」 — what the
                                  reader spends is what they are scanning for; the
                                  full bill is the context underneath it. On a bill
                                  nobody shares the two are the same number, so the
                                  row keeps its single total.
                                */}
                                {isSplit && viewerShare !== undefined && (
                                    <div className="text-base font-black text-violet-600">
                                        分帳・你 ${Math.round(viewerShare).toLocaleString()}
                                    </div>
                                )}
                                {refunded > 0 && (
                                    <div className="text-[11px] font-medium text-slate-400 line-through">
                                        TWD {Math.abs(Math.round(item.twdAmount)).toLocaleString()}
                                    </div>
                                )}
                                <div className={
                                    isSplit && viewerShare !== undefined
                                        ? 'text-[11px] font-bold text-slate-400'
                                        : `text-base font-black ${isIncome ? 'text-emerald-600' : 'text-[#11183d]'}`
                                }>
                                    {isIncome ? '+' : ''}TWD {Math.abs(Math.round(netAmount)).toLocaleString()}
                                </div>
                                {refunded > 0 && (
                                    <div data-testid={`refund-deducted-${item.id}`} className="text-[11px] font-bold text-emerald-600">
                                        已退稅 −{Math.round(refunded).toLocaleString()}
                                    </div>
                                )}

                                {isIncome && <div className="text-[10px] font-bold text-emerald-500">入帳完成</div>}
                                {!isIncome && item.category === Category.EXCHANGE && item.handlingFee ? (
                                    <div className="text-[10px] text-orange-500">含手續費 ${item.handlingFee}</div>
                                ) : null}
                                {item.currency !== 'TWD' && (
                                    <div className="text-[10px] text-slate-400">
                                        {Math.abs(item.amount).toLocaleString()} {item.currency}
                                    </div>
                                )}

                            </div>
                            {open && (
                                <button
                                    type="button"
                                    onClick={open}
                                    aria-label={mayOpenForm(item) ? `編輯 ${item.description || '這筆支出'}` : `查看 ${item.description || '這筆支出'} 的疑問`}
                                    data-testid={`expense-open-${item.id}`}
                                    className="-mr-1 flex h-9 w-7 items-center justify-center text-slate-300 transition hover:text-slate-500"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                    );
                })}
            </div>
          </div>
        );
      })}
      {/* Folded away, never dropped: one tap brings the rest back. */}
      {others.length > 0 && (
        <button
          type="button"
          data-testid="others-ledger-toggle"
          onClick={() => setOthersShown(shown => !shown)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
        >
          <Users size={14} />
          {othersShown
            ? `收起旅伴自己的帳（${others.length} 筆）`
            : `旅伴自己的帳 ${others.length} 筆 · 不用你分攤`}
        </button>
      )}
    </div>
  );
};

export default ExpenseList;
