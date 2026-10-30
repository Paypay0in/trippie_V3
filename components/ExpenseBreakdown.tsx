import React from 'react';
import { useTranslation } from 'react-i18next';
import { Expense, TripMember } from '../types';
import { calculateExpenseLedger } from '../services/splitCalculator';

interface Props {
  expense: Expense;
  roster: TripMember[];
  /** Highlights this member's own row. */
  viewerMemberId: string;
  tripOwnerMemberId: string;
}

const money = (n: number) => `NT$ ${Math.round(Math.abs(n)).toLocaleString()}`;

/**
 * The stored `splitMethod` value, to the one home that already names it.
 *
 * Keys only: a module-scope const cannot call `t()` without freezing the
 * language at import. The value side is `expense.splitMethodOption.*`, which the
 * expense form already uses, so the same split reads the same in both screens.
 */
const SPLIT_METHOD_KEYS: Record<string, string> = {
  // i18n-data: object keys are the stored Expense.splitMethod values
  EQUAL: 'expense.splitMethodOption.EQUAL',
  EXACT: 'expense.splitMethodOption.EXACT',
  PERCENT: 'expense.splitMethodOption.PERCENT',
};

/**
 * Read-only breakdown of who paid and who owes on one expense.
 *
 * A member who may not edit a record could previously see only its title, date
 * and total — while being asked to accept a share of it. This shows the same
 * numbers the ledger actually uses, so a question about a split can be asked
 * (or dropped) from the facts rather than from a guess.
 *
 * It reads calculateExpenseLedger, the same function settlement uses. Nothing
 * is recomputed here, so this view can never disagree with the money.
 */
const ExpenseBreakdown: React.FC<Props> = ({
  expense,
  roster,
  viewerMemberId,
  tripOwnerMemberId,
}) => {
  const { t } = useTranslation();
  const ledger = calculateExpenseLedger(expense, tripOwnerMemberId);

  const nameOf = (memberId: string) =>
    roster.find(member => member.id === memberId)?.name || t('settle.aCompanion');

  // Everyone with a stake, payers first so "who put the money in" reads first.
  const memberIds = Array.from(
    new Set([...Object.keys(ledger.paid), ...Object.keys(ledger.responsibility)]),
  );

  const rows = memberIds
    .map(id => ({
      id,
      paid: ledger.paid[id] || 0,
      owes: ledger.responsibility[id] || 0,
    }))
    .filter(row => Math.abs(row.paid) > 0.5 || Math.abs(row.owes) > 0.5);

  if (!rows.length) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-400 ring-1 ring-slate-100">
        {t('expense.breakdown.noSplit')}
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#11183d]">{t('expense.breakdown.title')}</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
          {SPLIT_METHOD_KEYS[expense.splitMethod]
            ? t(SPLIT_METHOD_KEYS[expense.splitMethod])
            : expense.splitMethod}
        </span>
      </div>

      <div className="mt-3 divide-y divide-slate-200">
        {rows.map(row => {
          const isViewer = row.id === viewerMemberId;
          return (
            <div key={row.id} className="flex items-center gap-3 py-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  isViewer ? 'bg-violet-600 text-white' : 'bg-white text-slate-500'
                }`}
              >
                {nameOf(row.id).charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">
                {nameOf(row.id)}
                {isViewer && <span className="ml-1 text-xs text-violet-600">{t('expense.breakdown.meSuffix')}</span>}
              </span>
              <div className="shrink-0 text-right">
                <div className="whitespace-nowrap text-xs font-medium text-slate-400">
                  {t('expense.breakdown.paid', { amount: money(row.paid) })}
                </div>
                <div className="whitespace-nowrap text-sm font-black text-[#11183d]">
                  {t('expense.breakdown.share', { amount: money(row.owes) })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExpenseBreakdown;
