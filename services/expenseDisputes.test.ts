import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import {
  approveDisputeProposal,
  buildExpenseProposal,
  canRevertDisputeProposal,
  canRaiseDispute,
  canRespondToDispute,
  canWithdrawDispute,
  countOpenDisputes,
  getInvolvedMemberIds,
  getOpenDisputes,
  getProposalChangedFields,
  isDisputeProposalStale,
  raiseDispute,
  resolveDispute,
  revertDisputeProposal,
  withdrawDispute,
} from './expenseDisputes';

const TRIP_ID = 'trip-1';
const ANN = `${TRIP_ID}:owner`; // trip owner
const GINA = 'member-gina';
const BOB = 'member-bob';
const OUTSIDER = 'member-outsider';

const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'expense-1',
  description: '晚餐',
  amount: 3000,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 3000,
  category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-09-15',
  createdByMemberId: ANN,
  payerId: ANN,
  beneficiaries: [ANN, GINA],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...overrides,
});

const ctx = (expense: Expense, viewerMemberId: string) => ({
  expense,
  viewerMemberId,
  tripOwnerMemberId: ANN,
});

describe('standing to raise a dispute', () => {
  it('lists payer and beneficiaries as the involved members', () => {
    const expense = makeExpense();
    expect(getInvolvedMemberIds(expense, ANN).sort()).toEqual([ANN, GINA].sort());
  });

  it('collapses legacy owner aliases when deciding involvement', () => {
    const expense = makeExpense({ payerId: 'me', beneficiaries: ['me', GINA] });
    expect(getInvolvedMemberIds(expense, ANN).sort()).toEqual([ANN, GINA].sort());
  });

  it('lets an affected non-creator raise a question', () => {
    expect(canRaiseDispute(ctx(makeExpense(), GINA))).toEqual({ allowed: true });
  });

  it('refuses the creator — they can just edit the record', () => {
    expect(canRaiseDispute(ctx(makeExpense(), ANN))).toEqual({
      allowed: false,
      reason: 'is-creator',
    });
  });

  it('refuses a member with no stake in the expense', () => {
    expect(canRaiseDispute(ctx(makeExpense(), OUTSIDER))).toEqual({
      allowed: false,
      reason: 'not-involved',
    });
  });

  it('refuses a second question while the first is still open', () => {
    const raised = raiseDispute(ctx(makeExpense(), GINA), {
      message: '這筆我沒有一起吃',
      id: 'dispute-1',
    });
    expect(raised.status).toBe('ok');
    if (raised.status !== 'ok') return;

    expect(canRaiseDispute(ctx(raised.expense, GINA))).toEqual({
      allowed: false,
      reason: 'already-open',
    });
    // A different affected member is still free to ask.
    const withBob = makeExpense({ beneficiaries: [ANN, GINA, BOB] });
    expect(canRaiseDispute(ctx(withBob, BOB)).allowed).toBe(true);
  });
});

describe('raising a dispute', () => {
  it('attaches the question without touching the money', () => {
    const expense = makeExpense();
    const result = raiseDispute(ctx(expense, GINA), {
      message: '  我那天不在，這筆要分我嗎？  ',
      id: 'dispute-1',
      now: '2026-09-15T10:00:00.000Z',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.dispute).toEqual({
      id: 'dispute-1',
      raisedByMemberId: GINA,
      message: '我那天不在，這筆要分我嗎？',
      status: 'open',
      createdAt: '2026-09-15T10:00:00.000Z',
    });

    // Accounting fields are carried through unchanged.
    expect(result.expense.twdAmount).toBe(expense.twdAmount);
    expect(result.expense.payerId).toBe(expense.payerId);
    expect(result.expense.beneficiaries).toEqual(expense.beneficiaries);
    expect(result.expense.splitAllocations).toEqual(expense.splitAllocations);
    // And the input object is not mutated.
    expect(expense.disputes).toBeUndefined();
  });

  it('rejects an empty question', () => {
    const result = raiseDispute(ctx(makeExpense(), GINA), {
      message: '   ',
      id: 'dispute-1',
    });
    expect(result).toEqual({ status: 'rejected', reason: 'empty-message' });
  });

  it('rejects an unauthorized raise even when called directly', () => {
    const result = raiseDispute(ctx(makeExpense(), OUTSIDER), {
      message: '我也想問',
      id: 'dispute-1',
    });
    expect(result).toEqual({ status: 'rejected', reason: 'not-involved' });
  });
});

describe('responding to a dispute', () => {
  const withOpen = () => {
    const result = raiseDispute(ctx(makeExpense(), GINA), {
      message: '金額對嗎？',
      id: 'dispute-1',
    });
    if (result.status !== 'ok') throw new Error('setup failed');
    return result.expense;
  };

  it('lets the creator answer and close it', () => {
    const expense = withOpen();
    const result = resolveDispute(ctx(expense, ANN), {
      disputeId: 'dispute-1',
      response: '已確認，金額正確',
      now: '2026-09-15T11:00:00.000Z',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.dispute.status).toBe('resolved');
    expect(result.dispute.response).toBe('已確認，金額正確');
    expect(result.dispute.respondedByMemberId).toBe(ANN);
    expect(result.dispute.resolvedAt).toBe('2026-09-15T11:00:00.000Z');
    expect(getOpenDisputes(result.expense)).toHaveLength(0);
  });

  it('lets the trip owner close a question on another member’s record', () => {
    const ginasRecord = makeExpense({
      createdByMemberId: GINA,
      payerId: GINA,
      beneficiaries: [GINA, BOB],
    });
    const raised = raiseDispute(ctx(ginasRecord, BOB), {
      message: '這筆我沒份',
      id: 'dispute-9',
    });
    if (raised.status !== 'ok') throw new Error('setup failed');

    expect(canRespondToDispute(ctx(raised.expense, ANN))).toBe(true);
    expect(resolveDispute(ctx(raised.expense, ANN), { disputeId: 'dispute-9' }).status).toBe('ok');
  });

  it('refuses the raiser and uninvolved members', () => {
    const expense = withOpen();
    expect(canRespondToDispute(ctx(expense, GINA))).toBe(false);
    expect(
      resolveDispute(ctx(expense, GINA), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'not-permitted' });
  });

  it('refuses to resolve a question that is not open', () => {
    const expense = withOpen();
    const once = resolveDispute(ctx(expense, ANN), { disputeId: 'dispute-1' });
    if (once.status !== 'ok') throw new Error('setup failed');
    expect(
      resolveDispute(ctx(once.expense, ANN), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'not-found' });
  });
});

describe('withdrawing a dispute', () => {
  const withOpen = () => {
    const result = raiseDispute(ctx(makeExpense(), GINA), {
      message: '先問一下',
      id: 'dispute-1',
    });
    if (result.status !== 'ok') throw new Error('setup failed');
    return result.expense;
  };

  it('lets the raiser take their own question back', () => {
    const expense = withOpen();
    const dispute = expense.disputes![0];
    expect(
      canWithdrawDispute(dispute, {
        viewerMemberId: GINA,
        tripOwnerMemberId: ANN,
      }),
    ).toBe(true);

    const result = withdrawDispute(ctx(expense, GINA), { disputeId: 'dispute-1' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.dispute.status).toBe('withdrawn');
    expect(getOpenDisputes(result.expense)).toHaveLength(0);

    // Withdrawing frees them to ask again later.
    expect(canRaiseDispute(ctx(result.expense, GINA)).allowed).toBe(true);
  });

  it('does not let someone else withdraw it', () => {
    const expense = withOpen();
    expect(
      withdrawDispute(ctx(expense, ANN), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'not-permitted' });
  });
});

describe('ledger summary', () => {
  it('counts open questions only', () => {
    const raised = raiseDispute(ctx(makeExpense(), GINA), {
      message: '問一下',
      id: 'dispute-1',
    });
    if (raised.status !== 'ok') throw new Error('setup failed');
    const closed = resolveDispute(ctx(raised.expense, ANN), {
      disputeId: 'dispute-1',
    });
    if (closed.status !== 'ok') throw new Error('setup failed');

    expect(countOpenDisputes([raised.expense, makeExpense({ id: 'e2' })])).toBe(1);
    expect(countOpenDisputes([closed.expense])).toBe(0);
  });
});


describe('proposed corrections', () => {
  const propose = (
    edited: Parameters<typeof buildExpenseProposal>[1],
    expense = makeExpense(),
  ) =>
    raiseDispute(ctx(expense, GINA), {
      message: '這筆好像不太對',
      id: 'dispute-1',
      proposal: buildExpenseProposal(expense, edited),
    });

  it('records only the fields that actually differ, with their originals', () => {
    const expense = makeExpense();
    const proposal = buildExpenseProposal(expense, {
      amount: 300,
      // Unchanged fields must not enter the proposal.
      beneficiaries: expense.beneficiaries,
    });

    expect(proposal.changes).toEqual({ amount: 300 });
    expect(proposal.basedOn).toEqual({ amount: 3000 });
    expect(getProposalChangedFields(proposal)).toEqual(['amount']);
  });

  it('captures a beneficiary change — "this one is not mine"', () => {
    const expense = makeExpense();
    const proposal = buildExpenseProposal(expense, { beneficiaries: [ANN] });
    expect(proposal.changes.beneficiaries).toEqual([ANN]);
    expect(proposal.basedOn.beneficiaries).toEqual([ANN, GINA]);
  });

  it('attaches the proposal without touching the money', () => {
    const result = propose({ amount: 300 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.dispute.proposal?.changes).toEqual({ amount: 300 });
    expect(result.expense.amount).toBe(3000);
    expect(result.expense.twdAmount).toBe(3000);
  });

  it('treats a proposal that changes nothing as a plain question', () => {
    const expense = makeExpense();
    const result = propose({ amount: expense.amount }, expense);
    if (result.status !== 'ok') throw new Error('setup failed');
    expect(result.dispute.proposal).toBeUndefined();
  });

  it('applies the amount through the expense own rate when approved', () => {
    const foreign = makeExpense({ amount: 100, currency: 'JPY', exchangeRate: 0.22, twdAmount: 22 });
    const raised = propose({ amount: 80 }, foreign);
    if (raised.status !== 'ok') throw new Error('setup failed');

    const approved = approveDisputeProposal(ctx(raised.expense, ANN), {
      disputeId: 'dispute-1',
      response: '你說得對',
    });
    expect(approved.status).toBe('ok');
    if (approved.status !== 'ok') return;

    expect(approved.expense.amount).toBe(80);
    expect(approved.expense.twdAmount).toBeCloseTo(80 * 0.22, 5);
    expect(approved.dispute.status).toBe('resolved');
    // Approving a correction is not a handover of the record.
    expect(approved.expense.createdByMemberId).toBe(ANN);
  });

  it('applies a beneficiary change and leaves the total alone', () => {
    const raised = propose({ beneficiaries: [ANN] });
    if (raised.status !== 'ok') throw new Error('setup failed');

    const approved = approveDisputeProposal(ctx(raised.expense, ANN), {
      disputeId: 'dispute-1',
    });
    if (approved.status !== 'ok') throw new Error('approve failed');

    expect(approved.expense.beneficiaries).toEqual([ANN]);
    expect(approved.expense.amount).toBe(3000);
    expect(approved.expense.twdAmount).toBe(3000);
  });

  it('keeps the handling fee in the recalculated total', () => {
    const exchange = makeExpense({ amount: 100, exchangeRate: 2, handlingFee: 30, twdAmount: 230 });
    const raised = propose({ amount: 50 }, exchange);
    if (raised.status !== 'ok') throw new Error('setup failed');
    const approved = approveDisputeProposal(ctx(raised.expense, ANN), { disputeId: 'dispute-1' });
    if (approved.status !== 'ok') throw new Error('approve failed');
    expect(approved.expense.twdAmount).toBe(50 * 2 + 30);
  });

  it('refuses a proposal whose expense has moved on since', () => {
    const raised = propose({ amount: 300 });
    if (raised.status !== 'ok') throw new Error('setup failed');

    // The creator edited the amount after the proposal was written.
    const edited = { ...raised.expense, amount: 2500, twdAmount: 2500 };
    expect(isDisputeProposalStale(edited.disputes![0], edited)).toBe(true);
    expect(
      approveDisputeProposal(ctx(edited, ANN), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'stale-proposal' });
  });

  it('only calls a proposal stale when a field it touches moved', () => {
    const raised = propose({ beneficiaries: [ANN] });
    if (raised.status !== 'ok') throw new Error('setup failed');
    // The creator changed something the proposal says nothing about.
    const edited = { ...raised.expense, description: '晚餐（改名）' };
    expect(isDisputeProposalStale(edited.disputes![0], edited)).toBe(false);
  });

  it('refuses approval from the raiser', () => {
    const raised = propose({ amount: 300 });
    if (raised.status !== 'ok') throw new Error('setup failed');
    expect(
      approveDisputeProposal(ctx(raised.expense, GINA), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'not-permitted' });
  });

  it('refuses to approve a question that carries no proposal', () => {
    const plain = raiseDispute(ctx(makeExpense(), GINA), {
      message: '這是什麼？',
      id: 'dispute-2',
    });
    if (plain.status !== 'ok') throw new Error('setup failed');
    expect(
      approveDisputeProposal(ctx(plain.expense, ANN), { disputeId: 'dispute-2' }),
    ).toEqual({ status: 'rejected', reason: 'not-found' });
  });
});


describe('what a proposal may change', () => {
  it('ignores fields outside the proposable set', () => {
    const expense = makeExpense();
    // Who actually paid is the creator's to state; a proposal cannot reassign
    // it, so those edits are dropped.
    const proposal = buildExpenseProposal(expense, {
      payerId: GINA,
      payerAllocations: { [GINA]: 3000 },
    });
    expect(proposal.changes).toEqual({});
    expect(getProposalChangedFields(proposal)).toEqual([]);
  });

  it('carries cost and division, the things members argue about', () => {
    const expense = makeExpense();
    const proposal = buildExpenseProposal(expense, {
      amount: 2000,
      beneficiaries: [ANN, GINA],
      splitMethod: 'EXACT',
      splitAllocations: { [ANN]: 1000, [GINA]: 1000 },
    });
    expect(getProposalChangedFields(proposal)).toEqual([
      'amount',
      'splitMethod',
      'splitAllocations',
    ]);
  });

  it('applies a per-member share change on approval', () => {
    const expense = makeExpense();
    const raised = raiseDispute(ctx(expense, GINA), {
      message: '我只用到 1000',
      id: 'dispute-share',
      proposal: buildExpenseProposal(expense, {
        splitMethod: 'EXACT',
        splitAllocations: { [ANN]: 2000, [GINA]: 1000 },
      }),
    });
    if (raised.status !== 'ok') throw new Error('setup failed');

    const approved = approveDisputeProposal(ctx(raised.expense, ANN), {
      disputeId: 'dispute-share',
    });
    if (approved.status !== 'ok') throw new Error('approve failed');
    expect(approved.expense.splitMethod).toBe('EXACT');
    expect(approved.expense.splitAllocations).toEqual({ [ANN]: 2000, [GINA]: 1000 });
    // The total is untouched: only its division moved.
    expect(approved.expense.amount).toBe(3000);
  });
});


describe('undoing an approved correction', () => {
  const approved = () => {
    const expense = makeExpense();
    const raised = raiseDispute(ctx(expense, GINA), {
      message: '金額不對',
      id: 'dispute-1',
      proposal: buildExpenseProposal(expense, { amount: 300 }),
    });
    if (raised.status !== 'ok') throw new Error('setup failed');
    const done = approveDisputeProposal(ctx(raised.expense, ANN), {
      disputeId: 'dispute-1',
    });
    if (done.status !== 'ok') throw new Error('approve failed');
    return done.expense;
  };

  it('puts the original values back and reopens the question', () => {
    const expense = approved();
    expect(expense.amount).toBe(300);
    expect(expense.disputes![0].appliedAt).toBeTruthy();

    const reverted = revertDisputeProposal(ctx(expense, ANN), {
      disputeId: 'dispute-1',
    });
    expect(reverted.status).toBe('ok');
    if (reverted.status !== 'ok') return;

    expect(reverted.expense.amount).toBe(3000);
    expect(reverted.expense.twdAmount).toBe(3000);
    // The disagreement is live again, and the proposal is still on the thread.
    expect(reverted.dispute.status).toBe('open');
    expect(reverted.dispute.appliedAt).toBeUndefined();
    expect(reverted.dispute.proposal?.changes).toEqual({ amount: 300 });
  });

  it('can be approved again after being taken back', () => {
    const expense = approved();
    const reverted = revertDisputeProposal(ctx(expense, ANN), { disputeId: 'dispute-1' });
    if (reverted.status !== 'ok') throw new Error('revert failed');

    const again = approveDisputeProposal(ctx(reverted.expense, ANN), {
      disputeId: 'dispute-1',
    });
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    expect(again.expense.amount).toBe(300);
  });

  it('refuses to undo once the expense moved on again', () => {
    const expense = approved();
    const edited = { ...expense, amount: 450, twdAmount: 450 };
    expect(canRevertDisputeProposal(edited.disputes![0], edited)).toBe(false);
    expect(
      revertDisputeProposal(ctx(edited, ANN), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'stale-proposal' });
  });

  it('recognises an approval made before the applied marker existed', () => {
    const expense = approved();
    // Same record, minus the marker: exactly how older data looks on disk.
    const legacy = {
      ...expense,
      disputes: expense.disputes!.map(d => ({ ...d, appliedAt: undefined })),
    };
    expect(canRevertDisputeProposal(legacy.disputes[0], legacy)).toBe(true);

    const reverted = revertDisputeProposal(ctx(legacy, ANN), { disputeId: 'dispute-1' });
    expect(reverted.status).toBe('ok');
    if (reverted.status !== 'ok') return;
    expect(reverted.expense.amount).toBe(3000);
  });

  it('offers nothing to undo on a plain reply', () => {
    const raised = raiseDispute(ctx(makeExpense(), GINA), {
      message: '這是什麼？',
      id: 'dispute-2',
    });
    if (raised.status !== 'ok') throw new Error('setup failed');
    const replied = resolveDispute(ctx(raised.expense, ANN), {
      disputeId: 'dispute-2',
      response: '就是機票',
    });
    if (replied.status !== 'ok') throw new Error('resolve failed');

    expect(canRevertDisputeProposal(replied.dispute, replied.expense)).toBe(false);
    expect(
      revertDisputeProposal(ctx(replied.expense, ANN), { disputeId: 'dispute-2' }),
    ).toEqual({ status: 'rejected', reason: 'not-found' });
  });

  it('refuses an undo from the raiser', () => {
    const expense = approved();
    expect(
      revertDisputeProposal(ctx(expense, GINA), { disputeId: 'dispute-1' }),
    ).toEqual({ status: 'rejected', reason: 'not-permitted' });
  });
});
