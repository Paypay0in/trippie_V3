import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import {
  canDeleteExpense,
  canEditExpense,
  getExpenseCreatorMemberId,
  getExpenseDeletePermission,
  isExpenseCreator,
  resolveExpenseDeleteRequest,
} from './expensePermissions';

const TRIP_ID = 'trip-1';
const ANN = `${TRIP_ID}:owner`; // Ann is the trip owner
const GINA = 'member-gina';

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
  payerId: ANN,
  beneficiaries: [ANN],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...overrides,
});

describe('expense ownership permissions', () => {
  it('A. lets the creator edit and delete their own expense', () => {
    const expense = makeExpense({ createdByMemberId: ANN, payerId: ANN });
    const context = {
      expense,
      viewerMemberId: ANN,
      tripOwnerMemberId: ANN,
    };

    expect(canEditExpense(context)).toBe(true);
    expect(canDeleteExpense(context)).toBe(true);
    expect(getExpenseDeletePermission(context).requiresAdminConfirmation).toBe(
      false,
    );
  });

  it('B. denies edit and delete to a different collaborator', () => {
    // Ann created it; Gina is a plain member, not the trip owner.
    const expense = makeExpense({ createdByMemberId: ANN });
    const context = {
      expense,
      viewerMemberId: GINA,
      tripOwnerMemberId: ANN,
    };

    expect(canEditExpense(context)).toBe(false);
    expect(canDeleteExpense(context)).toBe(false);
    expect(getExpenseDeletePermission(context).reason).toBe('denied');
  });

  it('C. does not grant creator permission from payer status alone', () => {
    // Gina owns this trip; Ann is a plain member who paid for the dinner.
    const ginaOwner = 'trip-2:owner';
    const annMember = 'member-ann';
    const expense = makeExpense({
      createdByMemberId: ginaOwner,
      payerId: annMember,
    });

    // Gina, the creator, keeps full permission even though she did not pay.
    const ginaContext = {
      expense,
      viewerMemberId: ginaOwner,
      tripOwnerMemberId: ginaOwner,
    };
    expect(canEditExpense(ginaContext)).toBe(true);
    expect(canDeleteExpense(ginaContext)).toBe(true);

    // Ann paid, but paying is not creating.
    const annContext = {
      expense,
      viewerMemberId: annMember,
      tripOwnerMemberId: ginaOwner,
    };
    expect(canEditExpense(annContext)).toBe(false);
    expect(canDeleteExpense(annContext)).toBe(false);
  });

  it('D. allows trip-owner admin delete but not admin edit', () => {
    const expense = makeExpense({ createdByMemberId: GINA, payerId: GINA });
    const context = {
      expense,
      viewerMemberId: ANN,
      tripOwnerMemberId: ANN,
    };

    const permission = getExpenseDeletePermission(context);
    expect(permission.allowed).toBe(true);
    expect(permission.reason).toBe('trip-owner-admin');
    expect(permission.requiresAdminConfirmation).toBe(true);
    expect(permission.creatorMemberId).toBe(GINA);

    // Administrative removal never implies the right to restate the numbers.
    expect(canEditExpense(context)).toBe(false);
  });

  it('E. keeps legacy expenses usable for the single-user owner', () => {
    const legacy = makeExpense({ payerId: 'me', beneficiaries: ['me'] });
    expect(legacy.createdByMemberId).toBeUndefined();

    const context = {
      expense: legacy,
      viewerMemberId: ANN,
      tripOwnerMemberId: ANN,
    };

    expect(getExpenseCreatorMemberId(legacy, ANN)).toBe(ANN);
    expect(canEditExpense(context)).toBe(true);
    expect(canDeleteExpense(context)).toBe(true);
    expect(getExpenseDeletePermission(context).requiresAdminConfirmation).toBe(
      false,
    );
  });

  it('attributes owner aliases to the active owner member id', () => {
    // Written under the legacy alias, and under an older trip id.
    expect(getExpenseCreatorMemberId({ createdByMemberId: 'me' }, ANN)).toBe(ANN);
    expect(
      getExpenseCreatorMemberId({ createdByMemberId: 'draft-9:owner' }, ANN),
    ).toBe(ANN);
    // A real member id is left alone.
    expect(getExpenseCreatorMemberId({ createdByMemberId: GINA }, ANN)).toBe(GINA);
  });

  it('treats a blank creator id as legacy rather than as a member', () => {
    expect(getExpenseCreatorMemberId({ createdByMemberId: '  ' }, ANN)).toBe(ANN);
  });
});

describe('delete action boundary', () => {
  const annExpense = makeExpense({ id: 'expense-ann', createdByMemberId: ANN });
  const ginaExpense = makeExpense({ id: 'expense-gina', createdByMemberId: GINA });
  const expenses = [annExpense, ginaExpense];

  it("F. rejects an unauthorized delete even when the handler is invoked directly", () => {
    // Gina is a plain member of Ann's trip and calls delete on Ann's expense.
    const outcome = resolveExpenseDeleteRequest({
      expenses,
      expenseId: 'expense-ann',
      viewerMemberId: GINA,
      tripOwnerMemberId: ANN,
    });

    expect(outcome.status).toBe('denied');
    if (outcome.status === 'denied') {
      expect(outcome.permission.reason).toBe('denied');
    }
  });

  it('allows the creator through and flags the owner admin path', () => {
    const own = resolveExpenseDeleteRequest({
      expenses,
      expenseId: 'expense-ann',
      viewerMemberId: ANN,
      tripOwnerMemberId: ANN,
    });
    expect(own.status).toBe('allowed');
    if (own.status === 'allowed') {
      expect(own.permission.requiresAdminConfirmation).toBe(false);
    }

    const admin = resolveExpenseDeleteRequest({
      expenses,
      expenseId: 'expense-gina',
      viewerMemberId: ANN,
      tripOwnerMemberId: ANN,
    });
    expect(admin.status).toBe('allowed');
    if (admin.status === 'allowed') {
      expect(admin.permission.reason).toBe('trip-owner-admin');
      expect(admin.permission.requiresAdminConfirmation).toBe(true);
      expect(admin.permission.creatorMemberId).toBe(GINA);
    }
  });

  it('reports a missing expense instead of silently succeeding', () => {
    expect(
      resolveExpenseDeleteRequest({
        expenses,
        expenseId: 'nope',
        viewerMemberId: ANN,
        tripOwnerMemberId: ANN,
      }).status,
    ).toBe('not-found');
  });
});

/**
 * 「這還是我的帳 Gina 依然收到」, and then 「你想辦法修好就對了」.
 *
 * `resolveViewer` answers with the trip owner when it cannot match the
 * signed-in user to a seat, so on her device `viewerMemberId` *was* his. Every
 * question in this file then returned a confident wrong answer about records
 * that were never hers — including the administrative delete, which would have
 * handed her the owner's power to remove anybody's entry behind a dialog
 * calling her the trip owner.
 *
 * A viewer the app could not identify owns nothing. That is both the honest
 * answer and the safe one.
 */
describe('a viewer the app could not identify', () => {
  const OWNER = 'seat-north';
  const bill = {
    id: 'e-1',
    description: '艾蒙德咖啡',
    amount: 5000,
    createdByMemberId: OWNER,
  } as never;

  const guessed = {
    expense: bill,
    // What the fallback produces: her device, holding his id.
    viewerMemberId: OWNER,
    viewerIsKnown: false,
    tripOwnerMemberId: OWNER,
  };

  it('creates nothing, edits nothing', () => {
    expect(isExpenseCreator(guessed)).toBe(false);
    expect(canEditExpense(guessed)).toBe(false);
  });

  it('deletes nothing, not even as the owner', () => {
    const permission = getExpenseDeletePermission(guessed);

    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe('denied');
    // The branch this closes: without the flag, an id equal to the owner's
    // takes the administrative path.
    expect(getExpenseDeletePermission({ ...guessed, viewerIsKnown: undefined }).reason)
      .toBe('creator');
  });

  /** Unset means no reason to doubt it, so nothing already working changes. */
  it('leaves every existing caller alone', () => {
    expect(isExpenseCreator({ expense: bill, viewerMemberId: OWNER, tripOwnerMemberId: OWNER }))
      .toBe(true);
  });
});
