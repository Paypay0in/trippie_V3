import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OVERLAY } from '../constants/layers';
import { Check, ChevronRight, MessageCircleQuestion, Pencil, Undo2, X } from 'lucide-react';
import { Expense, ExpenseDispute, TripMember } from '../types';
import { getCategoryIcon, PAYMENT_METHODS_CONFIG } from '../constants';
import { canEditExpense } from '../services/expensePermissions';
import ExpenseBreakdown from './ExpenseBreakdown';
import ProposalDiff from './ProposalDiff';
import {
  canRaiseDispute,
  canRespondToDispute,
  canWithdrawDispute,
  canRevertDisputeProposal,
  getDisputes,
  isDisputeProposalStale,
} from '../services/expenseDisputes';

interface Props {
  expense: Expense | null;
  roster: TripMember[];
  viewerMemberId: string;
  tripOwnerMemberId: string;
  onClose: () => void;
  onRaise: (message: string) => void;
  onResolve: (disputeId: string, response: string) => void;
  /** Accepts a proposed correction and writes it onto the expense. */
  onApprove: (disputeId: string, response: string) => void;
  /** Puts an approved correction back the way it was. */
  onRevert: (disputeId: string) => void;
  onWithdraw: (disputeId: string) => void;
  /**
   * Opens the expense itself. Only offered to someone who may actually edit
   * it — a non-creator has nothing to open, and a link that lands on a refusal
   * toast is the same dead end this modal exists to remove.
   */
  onOpenExpense?: (expense: Expense) => void;
}

/** The status is the stored value; the label is what gets read. */
const STATUS_KEY: Record<ExpenseDispute['status'], string> = {
  open: 'expense.dispute.statusOpen',
  resolved: 'expense.dispute.statusResolved',
  withdrawn: 'expense.dispute.statusWithdrawn',
};

const STATUS_STYLE: Record<ExpenseDispute['status'], string> = {
  open: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  withdrawn: 'bg-slate-100 text-slate-400',
};

/**
 * The 提出疑問 surface.
 *
 * Members who may not edit or delete an expense end up here instead. The modal
 * shows the record, the questions already attached to it, and — depending on
 * who is looking — a box to ask, to answer, or nothing but the thread.
 */
const ExpenseDisputeModal: React.FC<Props> = ({
  expense,
  roster,
  viewerMemberId,
  tripOwnerMemberId,
  onClose,
  onRaise,
  onResolve,
  onApprove,
  onRevert,
  onWithdraw,
  onOpenExpense,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});

  if (!expense) return null;

  const context = { expense, viewerMemberId, tripOwnerMemberId };
  const raisePermission = canRaiseDispute(context);
  const mayRespond = canRespondToDispute(context);
  const disputes = getDisputes(expense);
  const Icon = getCategoryIcon(expense.category);
  const paymentLabel = PAYMENT_METHODS_CONFIG[expense.paymentMethod]?.label;
  const nameOf = (memberId: string) =>
    roster.find(member => member.id === memberId)?.name || t('settle.aCompanion');

  const meta = [expense.date.replace(/-/g, '/'), paymentLabel].filter(Boolean);
  const mayEditExpense = canEditExpense(context);
  // Someone who may only propose still opens the same form — the difference is
  // what happens on submit, not whether they can look.
  const canOpenExpense =
    Boolean(onOpenExpense) && (mayEditExpense || raisePermission.allowed);

  return (
    <div
      className={`fixed inset-0 ${OVERLAY.thread} flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(17,24,61,.22)]"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('expense.dispute.title')}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={onClose} aria-label={t('common.close')} className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#11183d]">
            <MessageCircleQuestion size={20} className="text-violet-600" />
            {t('expense.dispute.title')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* The record under discussion. Tappable for whoever may edit it, so
              the answer to a question can be made in one step. */}
          <button
            type="button"
            onClick={() => canOpenExpense && onOpenExpense?.(expense)}
            disabled={!canOpenExpense}
            className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-100 transition-colors enabled:hover:bg-slate-100 disabled:cursor-default"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[#11183d]">
                {expense.description || t('expense.dispute.thisExpense')}
              </div>
              <div className="mt-0.5 truncate text-xs font-medium text-slate-400">
                {meta.join(' · ')}
              </div>
            </div>
            <div className="flex-shrink-0 whitespace-nowrap text-base font-black text-[#11183d]">
              NT$ {Math.round(expense.twdAmount).toLocaleString()}
            </div>
            {canOpenExpense && (
              <ChevronRight size={18} className="flex-shrink-0 text-slate-300" />
            )}
          </button>
          {canOpenExpense && (
            <button
              type="button"
              onClick={() => onOpenExpense?.(expense)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-violet-200 py-2.5 text-sm font-black text-violet-600 transition-colors hover:bg-violet-50"
            >
              <Pencil size={15} />
              {mayEditExpense
                ? t('expense.dispute.openAndEdit')
                : t('expense.dispute.editAndPropose')}
            </button>
          )}

          {/* The numbers behind the total. Shown to everyone: a member is being
              asked to accept a share, so they get to see how it was worked out. */}
          <div className="mt-4">
            <ExpenseBreakdown
              expense={expense}
              roster={roster}
              viewerMemberId={viewerMemberId}
              tripOwnerMemberId={tripOwnerMemberId}
            />
          </div>

          {/* Existing thread */}
          {disputes.length > 0 && (
            <div className="mt-5 space-y-3">
              {disputes.map(dispute => {
                const mayWithdraw = canWithdrawDispute(dispute, {
                  viewerMemberId,
                  tripOwnerMemberId,
                });
                return (
                  <div
                    key={dispute.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">
                        {nameOf(dispute.raisedByMemberId).charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#11183d]">
                        {nameOf(dispute.raisedByMemberId)}
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS_STYLE[dispute.status]}`}>
                        {t(STATUS_KEY[dispute.status])}
                      </span>
                    </div>

                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {dispute.message}
                    </p>

                    {dispute.response && (
                      <div className="mt-3 rounded-xl bg-[#f5f1ff] p-3 ring-1 ring-violet-100">
                        <div className="text-[10px] font-black text-violet-700">
                          {t('expense.dispute.replyBy', { name: nameOf(dispute.respondedByMemberId || '') })}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-700">
                          {dispute.response}
                        </p>
                      </div>
                    )}

                    {dispute.proposal && (
                      <>
                        <ProposalDiff
                          proposal={dispute.proposal}
                          expense={expense}
                          roster={roster}
                        />
                        {/* Staleness only matters while a proposal is still
                            waiting: once approved, the values differing from
                            the originals is the point, not a warning. */}
                        {dispute.status === 'open' &&
                          isDisputeProposalStale(dispute, expense) && (
                          <p className="mt-2 rounded-xl bg-amber-100/70 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
                            {t('expense.dispute.proposalStale')}
                          </p>
                          )}
                      </>
                    )}

                    {dispute.status === 'open' &&
                      mayRespond &&
                      Boolean(dispute.proposal) &&
                      !isDisputeProposalStale(dispute, expense) && (
                        <button
                          type="button"
                          onClick={() => onApprove(dispute.id, responses[dispute.id] || '')}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white transition-colors hover:bg-emerald-700"
                        >
                          <Check size={15} /> {t('expense.dispute.approveAndApply')}
                        </button>
                      )}

                    {dispute.status === 'open' && mayRespond && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          rows={2}
                          value={responses[dispute.id] || ''}
                          onChange={e =>
                            setResponses(prev => ({ ...prev, [dispute.id]: e.target.value }))
                          }
                          placeholder={t('expense.dispute.replyPlaceholder')}
                          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                        />
                        <button
                          type="button"
                          onClick={() => onResolve(dispute.id, responses[dispute.id] || '')}
                          className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white transition-colors hover:bg-violet-700"
                        >
                          {dispute.proposal
                            ? t('expense.dispute.replyOnly')
                            : t('expense.dispute.markReplied')}
                        </button>
                      </div>
                    )}

                    {/* Approving is one tap, so changing your mind has to be
                        one tap as well. */}
                    {mayRespond && canRevertDisputeProposal(dispute, expense) && (
                      <button
                        type="button"
                        onClick={() => onRevert(dispute.id)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        <Undo2 size={15} /> {t('expense.dispute.revertCorrection')}
                      </button>
                    )}

                    {dispute.status === 'open' && mayWithdraw && (
                      <button
                        type="button"
                        onClick={() => onWithdraw(dispute.id)}
                        className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        {t('expense.dispute.withdraw')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ask */}
          {raisePermission.allowed && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-violet-500" />
                <span className="text-sm font-black tracking-tight text-[#11183d]">{t('expense.dispute.raise')}</span>
              </div>
              <p className="mb-2 text-xs font-medium leading-relaxed text-slate-500">
                {t('expense.dispute.raiseBlurb')}
              </p>
              <textarea
                rows={3}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t('expense.dispute.raisePlaceholder')}
                className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />

              <button
                type="button"
                disabled={!message.trim()}
                onClick={() => {
                  onRaise(message);
                  setMessage('');
                }}
                className="mt-3 w-full rounded-2xl bg-violet-600 py-3.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(124,58,237,.3)] transition-colors hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {t('expense.dispute.submit')}
              </button>
            </div>
          )}

          {!raisePermission.allowed && raisePermission.reason === 'already-open' && (
            <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-800 ring-1 ring-amber-100">
              {t('expense.dispute.alreadyOpen')}
            </p>
          )}

          {disputes.length === 0 && !raisePermission.allowed && (
            <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-medium leading-relaxed text-slate-500 ring-1 ring-slate-100">
              {t('expense.dispute.none')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseDisputeModal;
