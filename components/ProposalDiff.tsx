import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Expense, ExpenseProposal, ExpenseProposalFields, TripMember } from '../types';
import { getProposalChangedFields } from '../services/expenseDisputes';

interface Props {
  proposal: ExpenseProposal;
  expense: Expense;
  roster: TripMember[];
}

/*
  Keys, not words. Both maps are built at import, where a `t()` would freeze
  the labels to whichever language loaded first. The map keys themselves are
  the stored field names and split methods and are untouched.
*/
const FIELD_KEY: Record<keyof ExpenseProposalFields, string> = {
  amount: 'proposalDiff.fieldAmount',
  payerId: 'proposalDiff.fieldPayer',
  payerAllocations: 'proposalDiff.fieldPayerAllocations',
  beneficiaries: 'proposalDiff.fieldBeneficiaries',
  splitMethod: 'proposalDiff.fieldSplitMethod',
  splitAllocations: 'proposalDiff.fieldSplitAllocations',
};

const SPLIT_KEY: Record<string, string> = {
  EQUAL: 'proposalDiff.methodEqual',
  EXACT: 'proposalDiff.methodExact',
  PERCENT: 'proposalDiff.methodPercent',
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
  const { t } = useTranslation();
  const nameOf = (memberId: string) =>
    roster.find(member => member.id === memberId)?.name || t('settle.aCompanion');

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
        return ids.length ? ids.map(nameOf).join(t('common.listSeparator')) : t('proposalDiff.none');
      }
      case 'splitMethod':
        // An unknown method falls back to the stored value itself, which is
        // the one thing guaranteed to be true even without a label for it.
        const key = SPLIT_KEY[String(value)];
        return key ? t(key) : String(value);
      case 'payerAllocations':
      case 'splitAllocations': {
        const record = value as Record<string, number>;
        const entries = Object.entries(record).filter(([, amount]) => amount);
        if (!entries.length) return t('proposalDiff.none');
        return entries
          .map(([id, amount]) => `${nameOf(id)} ${Math.round(amount).toLocaleString()}`)
          .join(t('common.listSeparator'));
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
        {t('proposalDiff.heading', { n: fields.length })}
      </div>
      <div className="mt-2 space-y-2">
        {fields.map(field => (
          <div key={field}>
            <div className="text-[10px] font-bold text-amber-700/80">
              {t(FIELD_KEY[field])}
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
