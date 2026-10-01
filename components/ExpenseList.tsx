
import React from 'react';
import { Expense, Category, TaxRule } from '../types';
import { getCategoryIcon, PAYMENT_METHODS_CONFIG } from '../constants';
import { Trash2, Pencil, Tag, ArrowDownLeft, AlertTriangle, Users } from 'lucide-react';
import { MessageCircleQuestion } from 'lucide-react';
import { canDeleteExpense, canEditExpense } from '../services/expensePermissions';
import { canRaiseDispute, getOpenDisputes } from '../services/expenseDisputes';
import { partitionByConcern } from '../services/expenseConcernsMember';

interface Props {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  taxRule?: TaxRule | null;
  /**
   * Who is looking at the ledger, and who owns the trip. Optional so existing
   * single-user call sites keep working; when both are given, edit/delete
   * actions follow the ownership contract in services/expensePermissions.
   */
  viewerMemberId?: string;
  tripOwnerMemberId?: string;
  /** Opens the dispute thread for an expense. Omit to hide the entry. */
  onOpenDisputes?: (expense: Expense) => void;
}

const ExpenseList: React.FC<Props> = ({
  expenses,
  onDelete,
  onEdit,
  taxRule,
  viewerMemberId,
  tripOwnerMemberId,
  onOpenDisputes,
}) => {
  const [othersShown, setOthersShown] = React.useState(false);
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

  // Helper to get Day of Week
  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    // Note: getDay() returns 0 for Sunday
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return days[date.getDay()];
  };

  return (
    <div className="space-y-6 pb-24">
      {sortedDates.map((date) => {
        const dayExpenses = groupedByDate[date];
        // Calculate daily total for easier checking (Net total)
        const dailyTotal = dayExpenses.reduce((sum, item) => sum + item.twdAmount, 0);

        return (
          <div key={date} className="animate-fade-in-up">
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3 px-1 sticky top-0 bg-gray-50/95 backdrop-blur-sm py-3 z-[5]">
                <div className="font-bold text-gray-800 text-lg tracking-tight">
                    {date.slice(5).replace('-', '/')} {/* Show MM/DD */}
                </div>
                <div className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                    {getDayLabel(date)}
                </div>
                <div className="flex-1 border-b-2 border-dotted border-gray-200 ml-2"></div>
                <div className="text-xs font-bold text-gray-400">
                    單日小計 <span className="text-gray-600 text-sm ml-1">${Math.round(dailyTotal).toLocaleString()}</span>
                </div>
            </div>

            {/* Expenses for this date */}
            <div className="space-y-3">
                {dayExpenses.map((item) => {
                    // Detect if this is an Income/Refund (Negative Amount)
                    const isIncome = item.amount < 0;
                    
                    const Icon = isIncome ? ArrowDownLeft : getCategoryIcon(item.category);
                    const PaymentConfig = PAYMENT_METHODS_CONFIG[item.paymentMethod];
                    const PaymentIcon = PaymentConfig?.icon;
                    
                    // Check Tax Eligibility (Only for positive spendings)
                    const isRefundable = !isIncome && taxRule && 
                                         item.phase === 'during' && 
                                         item.currency === taxRule.currency && 
                                         item.amount >= taxRule.minSpend;

                    return (
                    <div key={item.id} className={`p-3 rounded-xl shadow-sm border flex items-center gap-3 relative overflow-hidden transition-colors ${isIncome ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-gray-100'}`}>
                        
                        {/* Refund Eligible Indicator Strip */}
                        {isRefundable && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                        )}
                        
                        {/* Income Indicator Strip */}
                        {isIncome && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                        )}

                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ml-1 
                            ${isIncome 
                                ? 'bg-emerald-100 text-emerald-600' 
                                : item.category === Category.EXCHANGE 
                                    ? 'bg-orange-100 text-orange-600' 
                                    : 'bg-brand-50 text-brand-500'
                            }`}
                        >
                            <Icon size={20} />
                        </div>

                        {/* Description & Tags - Flex Grow to take available space */}
                        <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold truncate text-sm md:text-base flex items-center gap-2 ${isIncome ? 'text-emerald-900' : 'text-gray-800'}`}>
                                {item.description}
                                {item.needsReview && (
                                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded flex items-center gap-1 border border-yellow-200">
                                        <AlertTriangle size={10} /> 待確認
                                    </span>
                                )}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap mt-0.5">
                                <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${isIncome ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-gray-100'}`}>
                                    {isIncome ? '退稅入帳' : item.category}
                                </span>
                                <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                                    {PaymentIcon && <PaymentIcon size={10} />}
                                    {PaymentConfig?.label}
                                </span>
                                {isRefundable && (
                                    <span className="flex items-center gap-0.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap font-bold">
                                        <Tag size={10} /> 退稅資格
                                    </span>
                                )}
                                {(item.beneficiaries.length > 1 || Object.keys(item.splitAllocations || {}).length > 1 || Object.keys(item.payerAllocations || {}).length > 1) && (
                                    <span className="flex items-center gap-0.5 bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded border border-violet-100 whitespace-nowrap font-bold">
                                        <Users size={10} /> 分帳
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {/* Amount Display */}
                        <div className="text-right flex-shrink-0">
                            {/* Main Amount (TWD) */}
                            <div className={`font-bold text-sm md:text-base ${isIncome ? 'text-emerald-600' : 'text-gray-900'}`}>
                                {isIncome ? '+' : ''} NT$ {Math.abs(Math.round(item.twdAmount)).toLocaleString()}
                            </div>
                            
                            {/* Subtext: Status or Fee */}
                            {isIncome ? (
                                <div className="text-[10px] text-emerald-500 font-bold whitespace-nowrap">
                                    入帳完成
                                </div>
                            ) : (
                                item.category === Category.EXCHANGE && item.handlingFee ? (
                                    <div className="text-[10px] text-orange-500 whitespace-nowrap">
                                    含手續費 ${item.handlingFee}
                                    </div>
                                ) : null
                            )}

                            {/* Original Currency (if not TWD) */}
                            {item.currency !== 'TWD' && (
                                <div className="text-[10px] md:text-xs text-gray-400 whitespace-nowrap">
                                {Math.abs(item.amount).toLocaleString()} {item.currency}
                                </div>
                            )}
                        </div>

                        {/* Actions — only rendered for someone who may use them.
                            A greyed-out button still says "there is something
                            here for you"; on another member's record there is
                            nothing. Enforcement stays in the handler regardless. */}
                        {(mayOpenForm(item) || mayDelete(item) || mayDispute(item)) && (
                        <div className="flex items-center gap-0.5 pl-2 border-l border-gray-200 ml-1 flex-shrink-0">
                            {mayDispute(item) && (
                            // Labelled for someone who can actually ask: an
                            // unlabelled icon gives no hint that this is the
                            // way out when edit and delete are gone. Once a
                            // thread exists it collapses back to the icon so it
                            // does not crowd the creator's own actions.
                            <button
                                onClick={() => onOpenDisputes?.(item)}
                                title={mayRaiseDispute(item) ? '提出疑問' : '查看疑問'}
                                className={`relative flex items-center gap-1 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors ${
                                    mayRaiseDispute(item)
                                        ? 'px-2.5 py-2 text-violet-600 bg-violet-50 text-xs font-bold whitespace-nowrap'
                                        : 'p-2'
                                }`}
                            >
                                <MessageCircleQuestion size={18} />
                                {mayRaiseDispute(item) && <span>提出疑問</span>}
                                {openDisputeCount(item) > 0 && (
                                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white" />
                                )}
                            </button>
                            )}
                            {mayOpenForm(item) && (
                            <button
                                onClick={() => onEdit(item)}
                                title="編輯支出"
                                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            >
                                <Pencil size={18} />
                            </button>
                            )}
                            {mayDelete(item) && (
                            <button
                                onClick={() => onDelete(item.id)}
                                title="刪除支出"
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                            )}
                        </div>
                        )}
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
