import React from 'react';
import { OVERLAY } from '../constants/layers';
import { Trash2 } from 'lucide-react';
import { Category, Expense } from '../types';
import { getCategoryIcon, PAYMENT_METHODS_CONFIG } from '../constants';

interface Props {
  /** The expense awaiting confirmation. `null` keeps the modal closed. */
  expense: Expense | null;
  /**
   * Set when the trip owner is removing a record another member created. The
   * modal then carries the stronger shared-ledger warning instead of the
   * ordinary one. Ownership itself is decided upstream, never here.
   */
  adminCreatorName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const formatDate = (date: string) => date.replace(/-/g, '/');

/**
 * Destructive confirmation for removing an expense.
 *
 * Presentation only: it renders the expense it is handed and reports the two
 * possible answers. It never reads expense state, never re-queries, and never
 * deletes — the caller owns the delete handler and the permission check.
 */
const DeleteExpenseConfirmModal: React.FC<Props> = ({
  expense,
  adminCreatorName,
  onCancel,
  onConfirm,
}) => {
  if (!expense) return null;

  const Icon = getCategoryIcon(expense.category);
  const paymentLabel = PAYMENT_METHODS_CONFIG[expense.paymentMethod]?.label;
  const isExchange = expense.category === Category.EXCHANGE;
  const expenseTitle = expense.description || '這筆支出';

  // The meta line only shows the parts we actually have, so a record missing a
  // payment method never renders a dangling separator.
  const metaParts = [formatDate(expense.date), paymentLabel].filter(Boolean);

  const title = adminCreatorName
    ? `刪除 ${adminCreatorName} 建立的支出？`
    : '刪除這筆支出？';
  const subtitle = adminCreatorName
    ? `這筆帳目由 ${adminCreatorName} 建立。刪除後會影響所有旅伴看到的帳本與結算結果。`
    : `「${expenseTitle}」將從這趟旅行的帳本中移除。`;
  const confirmLabel = adminCreatorName ? '仍要刪除' : '刪除';

  return (
    <div
      className={`fixed inset-0 ${OVERLAY.confirm} flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
      // Overlay dismisses, exactly like cancel. Deleting is only ever the
      // explicit button press.
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[0_24px_60px_rgba(17,24,61,.22)]"
        onClick={event => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <Trash2 size={28} className="text-red-500" />
          </div>
          <h3 className="mt-4 text-xl font-black tracking-tight text-[#11183d]">
            {title}
          </h3>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
            {subtitle}
          </p>
        </div>

        {/* Expense summary — rendered from the canonical record we were handed */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
              isExchange
                ? 'bg-orange-100 text-orange-600'
                : 'bg-brand-50 text-brand-500'
            }`}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-[#11183d]">
              {expenseTitle}
            </div>
            <div className="mt-0.5 truncate text-xs font-medium text-slate-400">
              {metaParts.join(' · ')}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="whitespace-nowrap text-base font-black text-[#11183d]">
              NT$ {Math.round(expense.twdAmount).toLocaleString()}
            </div>
            {expense.currency !== 'TWD' && (
              <div className="whitespace-nowrap text-[10px] font-medium text-slate-400">
                {Math.abs(expense.amount).toLocaleString()} {expense.currency}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-black text-slate-500 transition-colors hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(239,68,68,.32)] transition-colors hover:bg-red-600"
          >
            <Trash2 size={16} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteExpenseConfirmModal;
