import React from 'react';
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

const SPLIT_LABEL: Record<string, string> = {
  EQUAL: '平均分攤',
  EXACT: '指定金額',
  PERCENT: '依比例',
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
  const ledger = calculateExpenseLedger(expense, tripOwnerMemberId);

  const nameOf = (memberId: string) =>
    roster.find(member => member.id === memberId)?.name || '旅伴';

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
        這筆支出沒有設定分帳。
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#11183d]">分帳明細</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
          {SPLIT_LABEL[expense.splitMethod] || expense.splitMethod}
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
                {isViewer && <span className="ml-1 text-xs text-violet-600">（我）</span>}
              </span>
              <div className="shrink-0 text-right">
                <div className="whitespace-nowrap text-xs font-medium text-slate-400">
                  付款 {money(row.paid)}
                </div>
                <div className="whitespace-nowrap text-sm font-black text-[#11183d]">
                  分攤 {money(row.owes)}
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
