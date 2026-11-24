/**
 * @vitest-environment jsdom
 *
 * 「我現在看一個已經結束的旅程 點進去都直接是結算金額的頁面 我覺得不太 OK」.
 *
 * 「旅程結束後的總覽 是帳目的」 (2026-10-10) stays — a traveller still owed 662
 * should not have to go looking for that. What it assumed, and never said, is
 * that 「finished」 implies 「somebody owes somebody」. Settled trips kept asking
 * about money nobody was waiting for.
 *
 * Two halves are pinned, and the second is the one a careless reading deletes:
 * the report folds when the balance is clear, and it is still there, one tap
 * behind the fold, because a settled balance can stop being settled.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FinishedTripReport from '../components/FinishedTripReport';
import { tripIsSettled, viewerSettlementBalance } from '../services/viewerSettlementBalance';
import { Category, Expense, PaymentMethod } from '../types';

import i18n from '../i18n/config';

const ME = 'me';
const FRIEND = 'friend';

afterEach(cleanup);

const REPORT = <div data-testid="the-report">旅行結算報告</div>;

/** One bill, fronted by `paidBy`, split evenly between the two travellers. */
const bill = (id: string, paidBy: string, amount: number): Expense => ({
  id,
  description: '晚餐',
  amount,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: amount,
  category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-10-21',
  payerId: paidBy,
  beneficiaries: [ME, FRIEND],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  handlingFee: 0,
  needsReview: false,
});

describe('what the balance says', () => {
  it('is zero when everybody fronted their own share', () => {
    const expenses = [bill('a', ME, 1000), bill('b', FRIEND, 1000)];
    expect(viewerSettlementBalance({ expenses, viewerMemberId: ME })).toBe(0);
    expect(tripIsSettled({ expenses, viewerMemberId: ME })).toBe(true);
  });

  it('is what is owed back when one traveller fronted it all', () => {
    const expenses = [bill('a', ME, 1000)];
    expect(viewerSettlementBalance({ expenses, viewerMemberId: ME })).toBe(500);
    expect(tripIsSettled({ expenses, viewerMemberId: ME })).toBe(false);
  });

  it('is negative when the traveller still owes', () => {
    const expenses = [bill('b', FRIEND, 1000)];
    expect(viewerSettlementBalance({ expenses, viewerMemberId: ME })).toBe(-500);
    expect(tripIsSettled({ expenses, viewerMemberId: ME })).toBe(false);
  });

  it('treats a reader with no member identity as settled, not as unsettled', () => {
    // A solo ledger has no debt to resolve; leading with a settlement report
    // answers a question nobody asked.
    expect(viewerSettlementBalance({ expenses: [bill('a', ME, 1000)] })).toBeUndefined();
    expect(tripIsSettled({ expenses: [bill('a', ME, 1000)] })).toBe(true);
  });
});

describe('what a finished trip opens with', () => {
  it('opens on the report while money is still owed', () => {
    render(<FinishedTripReport settled={false}>{REPORT}</FinishedTripReport>);
    expect(screen.getByTestId('the-report')).toBeTruthy();
    expect(screen.queryByTestId('settled-trip-report-disclosure')).toBeNull();
  });

  it('folds the report once the trip is settled, and says so', () => {
    render(<FinishedTripReport settled>{REPORT}</FinishedTripReport>);
    expect(screen.queryByTestId('the-report')).toBeNull();
    const fold = screen.getByTestId('settled-trip-report-disclosure');
    expect(fold.textContent).toContain(i18n.t('summary.title'));
    expect(fold.textContent).toContain(i18n.t('settle.settledUp'));
  });

  it('keeps the report one tap away — folded is not deleted', () => {
    // The half a careless reading removes. A settled balance can stop being
    // settled: a late bill, a correction, a companion disputing a share.
    render(<FinishedTripReport settled>{REPORT}</FinishedTripReport>);
    fireEvent.click(screen.getByTestId('settled-trip-report-disclosure'));
    expect(screen.getByTestId('the-report')).toBeTruthy();
  });
});
