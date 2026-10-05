import React, { useMemo } from 'react';
import { Plane, ReceiptText } from 'lucide-react';
import { Category, Expense, ShoppingItem, TaxRule, TravelRules, TripMember } from '../types';
import ExpenseList from './ExpenseList';
import PostTripChecklist from './PostTripChecklist';
import ShoppingListPanel from './ShoppingListPanel';
import { deriveDuringRefundState } from '../services/duringRefundState';
import { CustomCategoryRefundability } from '../services/refundableCustomCategories';
import TaxRefundSummaryCard from './TaxRefundSummaryCard';

interface Props {
  expenses: Expense[];
  shoppingList: ShoppingItem[];
  taxRule?: TaxRule | null;
  travelRules?: TravelRules;
  onSettleRefund: () => void;
  /** Marks one purchase as refunded at the till; forwarded to the refund card. */
  onToggleRefundedAtPurchase?: (expenseId: string, refunded: boolean) => void;
  /** 「要加一個按鈕：不可退稅」 — forwarded to the refund card unchanged. */
  onToggleRefundIneligible?: (expenseId: string, ineligible: boolean) => void;
  /** Records the refund actually received for one purchase. */
  onRecordActualRefund?: (expenseId: string, actual: number | undefined) => void;
  onQuickAddCategory: (category: Category) => void;
  onAddShoppingItem: (name: string) => void;
  onRemoveShoppingItem: (id: string) => void;
  onPurchaseShoppingItem: (item: ShoppingItem) => void;
  onDeleteExpense: (id: string) => void;
  onEditExpense: (expense: Expense) => void;
  /** Identity pair for expense ownership; forwarded straight to ExpenseList. */
  viewerMemberId?: string;
  /** What the traveller has said about their own categories. */
  refundableCustomCategories?: CustomCategoryRefundability;
  tripOwnerMemberId?: string;
  onOpenDisputes?: (expense: Expense) => void;
  /** The travellers, so each row can name who paid. Forwarded to ExpenseList. */
  members?: TripMember[];
}

const WalletReturnScreen: React.FC<Props> = ({
  refundableCustomCategories = {},
  expenses,
  shoppingList,
  taxRule,
  travelRules,
  onSettleRefund,
  onToggleRefundedAtPurchase,
  onToggleRefundIneligible,
  onRecordActualRefund,
  onQuickAddCategory,
  onAddShoppingItem,
  onRemoveShoppingItem,
  onPurchaseShoppingItem,
  onDeleteExpense,
  onEditExpense,
  viewerMemberId,
  tripOwnerMemberId,
  onOpenDisputes,
  members,
}) => {
  const postExpenses = useMemo(() => expenses.filter(expense => expense.phase === 'post'), [expenses]);
  const returnTotal = useMemo(() => postExpenses.reduce((sum, expense) => sum + expense.twdAmount, 0), [postExpenses]);
  const returnShoppingList = useMemo(() => shoppingList.filter(item => item.phase === 'post'), [shoppingList]);
  // Same rule as the during-trip card: a refund is claimed by whoever paid.
  const refundState = useMemo(
    () => deriveDuringRefundState({
      expenses, travelRules, viewerMemberId, tripOwnerMemberId,
      customDecisions: refundableCustomCategories,
    }),
    [expenses, travelRules, viewerMemberId, tripOwnerMemberId],
  );

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.6rem] bg-gradient-to-br from-[#151d4c] to-[#343c82] p-5 text-white shadow-[0_14px_34px_rgba(31,41,96,.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><Plane size={23} /></div>
            <h1 className="text-2xl font-black tracking-[-0.04em]">回國機場消費</h1>
            <p className="mt-2 text-sm font-medium text-white/75">辦理退稅、完成最後採買，整理返程支出。</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 text-right backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/60">返程支出</p>
            <p className="mt-1 text-xl font-black">NT$ {Math.round(returnTotal).toLocaleString()}</p>
          </div>
        </div>
      </section>

      <TaxRefundSummaryCard refundState={refundState} onSettleRefund={onSettleRefund} onToggleRefundedAtPurchase={onToggleRefundedAtPurchase} onToggleRefundIneligible={onToggleRefundIneligible} onRecordActualRefund={onRecordActualRefund} returnContext />

      <PostTripChecklist onQuickAddCategory={onQuickAddCategory} expenses={expenses} />

      <ShoppingListPanel
        title="🛍️ 免稅 / 機場待買清單"
        shoppingList={returnShoppingList}
        onAddItem={onAddShoppingItem}
        onRemoveItem={onRemoveShoppingItem}
        onPurchaseItem={onPurchaseShoppingItem}
      />

      {taxRule && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-black">退稅提醒</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{taxRule.notes || '請依現場退稅流程準備購買證明與相關文件。'}</p>
        </section>
      )}

      <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_28px_rgba(49,46,129,.06)] ring-1 ring-slate-100">
        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="text-lg font-black text-[#11183d]">返程支出 / 機場消費</h2><p className="mt-1 text-xs font-medium text-slate-400">僅顯示返程階段的實際支出</p></div>
          <div className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700"><ReceiptText size={13} /> NT$ {Math.round(returnTotal).toLocaleString()}</div>
        </div>
        <ExpenseList expenses={postExpenses} onDelete={onDeleteExpense} onEdit={onEditExpense} taxRule={taxRule} viewerMemberId={viewerMemberId} tripOwnerMemberId={tripOwnerMemberId} members={members} onOpenDisputes={onOpenDisputes} />
      </section>
    </div>
  );
};

export default WalletReturnScreen;
