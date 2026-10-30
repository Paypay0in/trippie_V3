import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <div><p className="text-xs font-bold tracking-[0.16em] text-indigo-500">{t('wallet.budget.eyebrow')}</p><h3 className="mt-1 text-lg font-black text-[#11183d]">{t('wallet.pre.budgetTotal')}</h3></div>
        <button type="button" onClick={onEditBudget} className="rounded-full p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t('wallet.pre.editBudget')}><Pencil size={16} /></button>
      </div>
      {!hasBudget ? (
        <div className="mt-4 rounded-2xl bg-indigo-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#11183d]"><WalletCards size={17} />{t('wallet.budget.noBudgetTitle')}</div>
          <p className="mt-1 text-xs text-slate-500">{t('wallet.budget.noBudgetBlurb')}</p>
          <button type="button" onClick={onEditBudget} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">{t('wallet.budget.setBudget')}</button>
        </div>
      ) : (
        <>
          <div className="mt-3 text-4xl font-black tracking-tight text-[#11183d]">{formatMoney(budget, normalizedCurrency || 'TWD')}</div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{t('wallet.budget.spent')}</p><p className="mt-1 text-lg font-black text-[#11183d]">{calculation.actualSpent === undefined ? t('wallet.budget.cannotTotal') : formatMoney(calculation.actualSpent, normalizedCurrency || 'TWD')}</p></div>
            <div className="rounded-2xl bg-indigo-50 p-3"><p className="text-xs font-bold text-indigo-600">{t('wallet.pre.budgetRemaining')}</p><p className={`mt-1 text-lg font-black ${calculation.actualSpent !== undefined && budget - calculation.actualSpent < 0 ? 'text-rose-600' : 'text-[#11183d]'}`}>{calculation.actualSpent === undefined ? '—' : formatMoney(budget - calculation.actualSpent, normalizedCurrency || 'TWD')}</p></div>
          </div>
          {calculation.actualSpent === undefined ? <p className="mt-3 text-xs text-amber-700">{t('wallet.budget.mixedCurrency')}</p> : <div className="mt-5"><div className="mb-2 flex justify-between text-xs font-bold text-slate-500"><span>{t('wallet.budget.budgetUsed')}</span><span>{budget > 0 ? `${Math.round((calculation.actualSpent / budget) * 100)}%` : '—'}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div></div>}
        </>
      )}
    </section>
  );
};

export default WalletBudgetSummary;
