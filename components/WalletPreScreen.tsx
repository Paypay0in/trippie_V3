import React, { useMemo } from 'react';
import { ChevronRight, Pencil, Plus, WalletCards } from 'lucide-react';
import { Category, Expense, TripMember } from '../types';
import { totalPaidByMember } from '../services/expensePaidBy';
import { partitionByConcern } from '../services/expenseConcernsMember';
import { expenseCostToViewer } from '../services/viewerSpend';
import { calculateExpenseLedger } from '../services/splitCalculator';
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
  /** The travellers, so each row can name who paid. Forwarded to ExpenseList. */
  members?: TripMember[];
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

const WalletPreScreen: React.FC<Props> = ({ currency, budget, expenses, onEditBudget, onQuickAdd, onDeleteExpense, onEditExpense, taxRule, viewerMemberId, tripOwnerMemberId, onOpenDisputes, members }) => {
  const normalizedCurrency = currency?.trim().toUpperCase();
  const preExpenses = useMemo(() => expenses.filter(expense => expense.phase === 'pre'), [expenses]);
  /*
    Totals count the whole trip; lists carry only what this traveller settles.

    An earlier version filtered outright and a bill the second traveller had
    explicitly split with him vanished the night before they flew. Hiding money
    is the one failure this app cannot afford, so somebody else's spending is
    now folded inside the list rather than dropped, and every total below is
    still computed from every record.
  */
  const spendOf = (ledger: Expense[]) => {
    if (!normalizedCurrency) return undefined;
    const included = ledger.filter(expense => expense.category !== Category.HELP_BUY && expense.amount >= 0);
    const currencies = new Set(included.map(expense => expense.currency.toUpperCase()));
    if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(normalizedCurrency))) return undefined;
    return included.reduce((sum, expense) => sum + (expense.category === Category.EXCHANGE ? (expense.handlingFee || 0) : expense.amount), 0);
  };
  /**
   * What this traveller has spent, which is not what the trip has spent.
   *
   * 「旅伴的 888 是他自己的帳 沒有指給我 那就跟我無關！」 — and it was in his
   * total, and therefore in his budget bar. Money nobody has asked him to
   * settle cannot count against a budget he set for himself.
   *
   * The trip-wide figure is still stated below, so nothing disappears; it is
   * simply no longer the number presented as his.
   */
  const actualSpent = useMemo(
    () => spendOf(partitionByConcern(preExpenses, viewerMemberId).mine),
    [normalizedCurrency, preExpenses, viewerMemberId],
  );
  /**
   * What the trip has cost this traveller, as against what they have fronted.
   *
   * 「分帳完 我只出一半 所以 12000 我只花 6000」. The headline summed the bills
   * that concern him — 32,500 passing through his hands — on a trip costing him
   * 16,500, because half of the flights and half of the hotel are hers.
   */
  const borneByViewer = useMemo(() => {
    if (!viewerMemberId || !normalizedCurrency) return undefined;
    // Same rule as the dashboard and the summary. Computed here separately,
    // this dropped a bill the reader paid with nobody sharing it.
    const total = preExpenses.reduce(
      (sum, expense) => sum + expenseCostToViewer(expense, viewerMemberId, tripOwnerMemberId),
      0,
    );
    return Math.round(total);
  }, [preExpenses, viewerMemberId, tripOwnerMemberId, normalizedCurrency]);
  const tripWideSpent = useMemo(() => spendOf(preExpenses), [normalizedCurrency, preExpenses]);
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
    const included = partitionByConcern(preExpenses, viewerMemberId).mine
      .filter(expense => expense.category !== Category.HELP_BUY && expense.amount >= 0 && expense.category !== Category.EXCHANGE);
    return totalPaidByMember(included, viewerMemberId);
  }, [normalizedCurrency, actualSpent, viewerMemberId, preExpenses]);
  /** Only worth splitting out when somebody else actually paid for something. */
  const othersPaid = paidByViewer !== undefined && actualSpent !== undefined
    ? Math.round(actualSpent - paidByViewer)
    : undefined;
  const hasBudget = typeof budget === 'number' && Number.isFinite(budget) && budget >= 0;
  const percent = hasBudget && budget > 0 && actualSpent !== undefined ? Math.round((actualSpent / budget) * 100) : undefined;
  /**
   * What this traveller spent before the trip, one row per category.
   *
   * Built from the whole ledger, it listed 其他 NT$ 888 — money the second
   * traveller spent on herself — as a category of his own planning. The list
   * below it had already learned to fold somebody else's money away; this one
   * had not, so 「其他的 888 Gina 新增的又出現在我這邊」.
   */
  const myPreExpenses = useMemo(
    () => partitionByConcern(preExpenses, viewerMemberId).mine,
    [preExpenses, viewerMemberId],
  );
  const plannedRows = useMemo(() => {
    const rows = new Map<Category, Expense>();
    myPreExpenses.forEach(expense => { if (!rows.has(expense.category)) rows.set(expense.category, expense); });
    return Array.from(rows.values());
  }, [myPreExpenses]);
  /**
   * The most recent records, which this had never actually shown.
   *
   * `slice(0, 2)` takes the front of the array — the two oldest — under a
   * heading that says 最近記錄. A bill recorded minutes ago sat at the end and
   * was invisible: 「這是我剛剛新增的 他沒有出現在最近紀錄」. Newest first, and
   * enough of them that adding one is visibly answered.
   */
  const recentExpenses = useMemo(
    () => [...preExpenses]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5),
    [preExpenses],
  );

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
            <p className="text-xs font-bold text-slate-400">{borneByViewer === undefined ? '與你有關的支出' : '你的實際支出'}</p>
            <p className="mt-2 text-lg font-black text-[#11183d]">{(borneByViewer ?? actualSpent) === undefined ? '—' : money((borneByViewer ?? actualSpent) as number, normalizedCurrency || 'TWD')}</p>
            {/* Money that left this traveller's pocket, not bills that concern them. */}
            {borneByViewer !== undefined && paidByViewer !== undefined && Math.round(paidByViewer) !== borneByViewer && (
              <p data-testid="fronted" className="mt-1 text-[11px] font-bold text-slate-400">
                你先付出去 {money(paidByViewer, normalizedCurrency || 'TWD')}
              </p>
            )}
            {/* Stated whenever the trip has spent more than this traveller has,
                so the difference is visible rather than quietly absent. */}
            {tripWideSpent !== undefined && actualSpent !== undefined && tripWideSpent > actualSpent && (
              <p data-testid="trip-wide-spent" className="mt-1 text-[11px] font-bold text-slate-400">
                旅程總支出 {money(tripWideSpent, normalizedCurrency || 'TWD')}
              </p>
            )}
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

      <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_28px_rgba(49,46,129,.06)] ring-1 ring-slate-100"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-black text-[#11183d]">最近記錄</h2><p className="mt-1 text-xs font-medium text-slate-400">旅行前的實際支出</p></div><button type="button" onClick={() => undefined} className="text-xs font-black text-indigo-600">查看全部</button></div><ExpenseList expenses={recentExpenses} onDelete={onDeleteExpense} onEdit={onEditExpense} taxRule={taxRule as never} viewerMemberId={viewerMemberId} tripOwnerMemberId={tripOwnerMemberId} members={members} onOpenDisputes={onOpenDisputes} /></section>
    </div>
  );
};

export default WalletPreScreen;
