import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Expense, ExpenseProposal, ExpenseProposalFields, TripMember } from '../types';
import { getProposalChangedFields } from '../services/expenseDisputes';

interface Props {
  proposal: ExpenseProposal;
  expense: Expense;
  roster: TripMember[];
}

const FIELD_LABEL: Record<keyof ExpenseProposalFields, string> = {
  amount: '金額',
  payerId: '付款人',
  payerAllocations: '各自付款',
  beneficiaries: '分攤成員',
  splitMethod: '分帳方式',
  splitAllocations: '分攤金額',
};

const SPLIT_LABEL: Record<string, string> = {
  EQUAL: '平均分攤',
  EXACT: '指定金額',
  PERCENT: '依比例',
};

/**
 * Before/after view of a proposed correction.
 *
 * Approval has to be a judgement on a short, visible list of changes. Showing
 * the old value struck through next to the new one is what keeps "核准" from
 * becoming a blind signature — especially once a proposal may touch the split
 * and not just one number.
 */
const ProposalDiff: React.FC<Props> = ({ proposal, expense, roster }) => {
  const nameOf = (memberId: string) =>
    roster.find(member => member.id === memberId)?.name || '旅伴';

  const render = (
    field: keyof ExpenseProposalFields,
    value: unknown,
  ): string => {
    if (value === undefined || value === null) return '—';
    switch (field) {
      case 'amount':
        return `${Number(value).toLocaleString()} ${expense.currency}`;
      case 'payerId':
        return nameOf(String(value));
      case 'beneficiaries': {
        const ids = value as string[];
        return ids.length ? ids.map(nameOf).join('、') : '無';
      }
      case 'splitMethod':
        return SPLIT_LABEL[String(value)] || String(value);
      case 'payerAllocations':
      case 'splitAllocations': {
        const record = value as Record<string, number>;
        const entries = Object.entries(record).filter(([, amount]) => amount);
        if (!entries.length) return '無';
        return entries
          .map(([id, amount]) => `${nameOf(id)} ${Math.round(amount).toLocaleString()}`)
          .join('、');
      }
      default:
        return String(value);
    }
  };

  const fields = getProposalChangedFields(proposal);
  if (!fields.length) return null;

  return (
    <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
      <div className="text-[10px] font-black text-amber-700">
        修正建議（{fields.length} 項）
      </div>
      <div className="mt-2 space-y-2">
        {fields.map(field => (
          <div key={field}>
            <div className="text-[10px] font-bold text-amber-700/80">
              {FIELD_LABEL[field]}
            </div>
            <div className="mt-0.5 flex items-start gap-1.5 text-xs font-bold text-[#11183d]">
              <span className="text-slate-400 line-through">
                {render(field, proposal.basedOn[field])}
              </span>
              <ArrowRight size={13} className="mt-0.5 shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1">
                {render(field, proposal.changes[field])}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProposalDiff;
