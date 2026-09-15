import React, { useMemo } from 'react';
import { Pencil, WalletCards } from 'lucide-react';
import { Category, Expense } from '../types';

interface Props {
  currency?: string;
  budget?: number;
  expenses: Expense[];
  onEditBudget: () => void;
}

const formatMoney = (value: number, currency: string) =>
  `${currency === 'TWD' ? 'NT$' : currency} ${Math.round(value).toLocaleString()}`;

const WalletBudgetSummary: React.FC<Props> = ({ currency, budget, expenses, onEditBudget }) => {
  const normalizedCurrency = currency?.trim().toUpperCase();
  const calculation = useMemo(() => {
    if (!normalizedCurrency) return { actualSpent: undefined, reason: 'missing-currency' as const };
    const spendingExpenses = expenses.filter((expense) => expense.category !== Category.HELP_BUY && expense.amount >= 0);
    const currencies = new Set(spendingExpenses.map((expense) => expense.currency.toUpperCase()));
    if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(normalizedCurrency))) {
      return { actualSpent: undefined, reason: 'mixed-currency' as const };
    }
    const actualSpent = spendingExpenses.reduce((sum, expense) => {
      if (expense.category === Category.EXCHANGE) return sum + (expense.handlingFee || 0);
      return sum + expense.amount;
    }, 0);
    return { actualSpent, reason: undefined };
  }, [expenses, normalizedCurrency]);
  const hasBudget = typeof budget === 'number' && Number.isFinite(budget) && budget >= 0;
  const progress = hasBudget && budget > 0 && calculation.actualSpent !== undefined ? Math.min((calculation.actualSpent / budget) * 100, 100) : 0;

  return (
    <section className="rounded-[1.75rem] border border-indigo-100 bg-white p-6 shadow-[0_12px_32px_rgba(49,46,129,.08)]">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold tracking-[0.16em] text-indigo-500">旅行前・預算概覽</p><h3 className="mt-1 text-lg font-black text-[#11183d]">旅行總預算</h3></div>
        <button type="button" onClick={onEditBudget} className="rounded-full p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" aria-label="編輯預算"><Pencil size={16} /></button>
      </div>
      {!hasBudget ? (
        <div className="mt-4 rounded-2xl bg-indigo-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#11183d]"><WalletCards size={17} />尚未設定旅程預算</div>
          <p className="mt-1 text-xs text-slate-500">設定預算後，這裡會顯示已支出與剩餘預算。</p>
          <button type="button" onClick={onEditBudget} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">設定預算</button>
        </div>
      ) : (
        <>
          <div className="mt-3 text-4xl font-black tracking-tight text-[#11183d]">{formatMoney(budget, normalizedCurrency || 'TWD')}</div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">已支出</p><p className="mt-1 text-lg font-black text-[#11183d]">{calculation.actualSpent === undefined ? '暫無法合計' : formatMoney(calculation.actualSpent, normalizedCurrency || 'TWD')}</p></div>
            <div className="rounded-2xl bg-indigo-50 p-3"><p className="text-xs font-bold text-indigo-600">剩餘預算</p><p className={`mt-1 text-lg font-black ${calculation.actualSpent !== undefined && budget - calculation.actualSpent < 0 ? 'text-rose-600' : 'text-[#11183d]'}`}>{calculation.actualSpent === undefined ? '—' : formatMoney(budget - calculation.actualSpent, normalizedCurrency || 'TWD')}</p></div>
          </div>
          {calculation.actualSpent === undefined ? <p className="mt-3 text-xs text-amber-700">目前支出包含不同幣別，為避免錯誤合計，請先使用相同幣別的支出。</p> : <div className="mt-5"><div className="mb-2 flex justify-between text-xs font-bold text-slate-500"><span>已使用預算</span><span>{budget > 0 ? `${Math.round((calculation.actualSpent / budget) * 100)}%` : '—'}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div></div>}
        </>
      )}
    </section>
  );
};

export default WalletBudgetSummary;
