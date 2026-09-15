import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import {
  canRaiseDispute,
  canRespondToDispute,
  canWithdrawDispute,
  countOpenDisputes,
  getInvolvedMemberIds,
  getOpenDisputes,
  raiseDispute,
  resolveDispute,
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
