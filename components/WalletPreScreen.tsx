import React, { useMemo } from 'react';
import { ChevronRight, Pencil, Plus, WalletCards } from 'lucide-react';
import { Category, Expense } from '../types';
import { totalPaidByMember } from '../services/expensePaidBy';
import { partitionByConcern } from '../services/expenseConcernsMember';
import ExpenseList from './ExpenseList';

interface Props {
  currency?: string;
  budget?: number;
  expenses: Expense[];
  onEditBudget: () => void;
  onQuickAdd: () => void;
  onDeleteExpense: (id: string) => void;
  onEditExpense: (expense: Expense) => void;
  /** Identity pair for expense ownership; forwarded straight to ExpenseList. */
  viewerMemberId?: string;
  tripOwnerMemberId?: string;
  onOpenDisputes?: (expense: Expense) => void;
  taxRule?: unknown;
}

const categoryLabel = (category: Category) => {
  const labels: Partial<Record<Category, string>> = {
    [Category.FLIGHT]: '機票',
    [Category.ACCOMMODATION]: '住宿',
    [Category.VISA]: '簽證／入境費',
    [Category.INSURANCE]: '旅遊保險',
    [Category.SHOPPING]: '伴手禮／購物',
    [Category.OTHER]: '其他',
  };
  return labels[category] || category;
};

const money = (value: number, currency: string) => `${currency === 'TWD' ? 'NT$' : currency} ${Math.round(value).toLocaleString()}`;

const WalletPreScreen: React.FC<Props> = ({ currency, budget, expenses, onEditBudget, onQuickAdd, onDeleteExpense, onEditExpense, taxRule, viewerMemberId, tripOwnerMemberId, onOpenDisputes }) => {
  const normalizedCurrency = currency?.trim().toUpperCase();
  const allPreExpenses = useMemo(() => expenses.filter(expense => expense.phase === 'pre'), [expenses]);
  /**
   * The ledger this traveller is actually part of.
   *
   * A shared trip is not a shared feed. A bill she paid and is splitting with
   * him belongs here — they have to settle it. Something she bought for herself
   * does not: it was being added to his total and making his own number wrong.
   *
   * Founder decision, asked twice and answered twice: what is left out is not
   * mentioned either. A travelling companion's own shopping is not a gap in
   * this ledger, it is simply not in it — and a footnote counting her receipts
   * would be the app being clever about somebody else's money.
   */
  const preExpenses = useMemo(
    () => partitionByConcern(allPreExpenses, viewerMemberId).mine,
    [allPreExpenses, viewerMemberId],
  );
  const actualSpent = useMemo(() => {
    if (!normalizedCurrency) return undefined;
    const included = preExpenses.filter(expense => expense.category !== Category.HELP_BUY && expense.amount >= 0);
    const currencies = new Set(included.map(expense => expense.currency.toUpperCase()));
    if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(normalizedCurrency))) return undefined;
    return included.reduce((sum, expense) => sum + (expense.category === Category.EXCHANGE ? (expense.handlingFee || 0) : expense.amount), 0);
  }, [normalizedCurrency, preExpenses]);
  /**
   * What this traveller paid, as against what the trip spent.
   *
   * A shared ledger shows everybody — you cannot settle against one that hides
   * half the bills. What it must not do is hand one person the other's total:
   * 「已支出 NT$ 13,388」 on the screen of someone who had paid 12,500 of it,
   * the remaining 888 belonging to the traveller beside him.
   */
  const paidByViewer = useMemo(() => {
    if (!normalizedCurrency || actualSpent === undefined || !viewerMemberId) return undefined;
    const included = preExpenses.filter(expense => expense.category !== Category.HELP_BUY && expense.amount >= 0 && expense.category !== Category.EXCHANGE);
    return totalPaidByMember(included, viewerMemberId);
  }, [normalizedCurrency, actualSpent, viewerMemberId, preExpenses]);
  /** Only worth splitting out when somebody else actually paid for something. */
  const othersPaid = paidByViewer !== undefined && actualSpent !== undefined
    ? Math.round(actualSpent - paidByViewer)
    : undefined;
  const hasBudget = typeof budget === 'number' && Number.isFinite(budget) && budget >= 0;
  const percent = hasBudget && budget > 0 && actualSpent !== undefined ? Math.round((actualSpent / budget) * 100) : undefined;
  const plannedRows = useMemo(() => {
    const rows = new Map<Category, Expense>();
    preExpenses.forEach(expense => { if (!rows.has(expense.category)) rows.set(expense.category, expense); });
    return Array.from(rows.values());
  }, [preExpenses]);

  return (
    <div className="space-y-5">
      <section className="px-1 pt-1">
        <h1 className="text-[1.65rem] font-black tracking-[-0.04em] text-[#11183d]">旅行前・預估與已付費用</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">先規劃預算，掌握整趟旅程的花費。</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-[3fr_2fr]">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-[0_12px_32px_rgba(49,46,129,.08)] ring-1 ring-indigo-50">
          <div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.14em] text-indigo-500">旅行總預算</p><p className="mt-2 text-[2.2rem] font-black tracking-[-.05em] text-[#11183d]">{hasBudget ? money(budget, normalizedCurrency || 'TWD') : '尚未設定'}</p></div><button type="button" onClick={onEditBudget} aria-label="編輯預算" className="rounded-full p-2 text-indigo-600 hover:bg-indigo-50"><Pencil size={17} /></button></div>
          {hasBudget ? <><div className="mt-5 h-3 overflow-hidden rounded-full bg-indigo-50"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.min(percent || 0, 100)}%` }} /></div><div className="mt-2 flex justify-between text-xs font-bold text-slate-500"><span>已使用 {actualSpent === undefined ? '—' : money(actualSpent, normalizedCurrency || 'TWD')}</span><span className="text-sm font-black text-indigo-600">{percent === undefined ? '—' : `${percent}%`}</span></div></> : <button type="button" onClick={onEditBudget} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white">設定預算</button>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
          <div className="rounded-[1.35rem] bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-bold text-slate-400">{othersPaid && othersPaid > 0 ? '與你有關的支出' : '已支出'}</p>
            <p className="mt-2 text-lg font-black text-[#11183d]">{actualSpent === undefined ? '—' : money(actualSpent, normalizedCurrency || 'TWD')}</p>
            {/* Said only when it changes the meaning of the number above it. */}
            {othersPaid !== undefined && othersPaid > 0 && (
              <div data-testid="paid-split" className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-[11px] font-bold">
                <p className="text-slate-500">你付的 <span className="text-[#11183d]">{money(paidByViewer || 0, normalizedCurrency || 'TWD')}</span></p>
                <p className="text-slate-400">旅伴先付的 <span className="text-slate-500">{money(othersPaid, normalizedCurrency || 'TWD')}</span></p>
              </div>
            )}

          </div>
          <div className="rounded-[1.35rem] bg-[#f0efff] p-4"><p className="text-xs font-bold text-indigo-500">剩餘預算</p><p className={`mt-2 text-lg font-black ${actualSpent !== undefined && hasBudget && budget - actualSpent < 0 ? 'text-rose-600' : 'text-[#11183d]'}`}>{actualSpent === undefined || !hasBudget ? '—' : money(budget - actualSpent, normalizedCurrency || 'TWD')}</p></div>
        </div>
      </section>

      <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_28px_rgba(49,46,129,.06)] ring-1 ring-slate-100">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-[#11183d]">旅行前支出項目</h2><p className="mt-1 text-xs font-medium text-slate-400">目前資料僅包含已記錄的旅行前支出</p></div><button type="button" onClick={onQuickAdd} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600"><Plus size={14} />新增項目</button></div>
        {plannedRows.length ? <div className="mt-3 divide-y divide-slate-100">{plannedRows.map(expense => <div key={expense.id} className="flex items-center gap-3 py-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-600">{categoryLabel(expense.category).slice(0, 1)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#11183d]">{categoryLabel(expense.category)}</p><p className="mt-0.5 text-[11px] font-semibold text-emerald-600">已記錄支出 · {expense.currency} {Math.round(expense.amount).toLocaleString()}</p></div><ChevronRight size={17} className="text-slate-300" /></div>)}</div> : <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">尚未有旅行前支出項目。</div>}
      </section>

      <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_28px_rgba(49,46,129,.06)] ring-1 ring-slate-100"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-black text-[#11183d]">最近記錄</h2><p className="mt-1 text-xs font-medium text-slate-400">旅行前的實際支出</p></div><button type="button" onClick={() => undefined} className="text-xs font-black text-indigo-600">查看全部</button></div><ExpenseList expenses={preExpenses.slice(0, 2)} onDelete={onDeleteExpense} onEdit={onEditExpense} taxRule={taxRule as never} viewerMemberId={viewerMemberId} tripOwnerMemberId={tripOwnerMemberId} onOpenDisputes={onOpenDisputes} /></section>
    </div>
  );
};

export default WalletPreScreen;
