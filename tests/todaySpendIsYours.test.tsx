/**
 * @vitest-environment jsdom
 *
 * 「我打開看會是這樣 但我今天只有花 998」.
 *
 * 今日花費 summed `twdAmount` — the whole of every bill recorded today,
 * including the half his companion carries and the bills she paid for
 * herself. `expenseCostToViewer` is the one place that answers 「what did this
 * cost *me*」, and four other screens were already using it. This one was
 * doing its own arithmetic, which is the twelfth time that shape has turned
 * up and the second time it has turned up on money.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripLiveOverview from '../components/TripLiveOverview';
import { Expense, TripMember } from '../types';

const TODAY = '2026-10-20';
const OWNER = 'tokyo:owner';
const HER = 'seat-sherry';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: HER, name: 'Sherry', type: 'member' },
];

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', date: TODAY, phase: 'during', description: 'x',
  amountOriginal: 0, currency: 'TWD', twdAmount: 0, exchangeRate: 1,
  category: '餐飲', payerId: OWNER, beneficiaries: [OWNER],
  splitMethod: 'EQUAL', splitAllocations: {}, payerAllocations: {},
  ...over,
} as Expense);

const mount = (expenses: Expense[], over: Record<string, unknown> = {}) => {
  const props = Object.assign({
    expenses,
    itinerary: [],
    startDate: TODAY,
    endDate: TODAY,
    onQuickAdd: vi.fn(),
    onOpenPlanning: vi.fn(),
    onOpenRecords: vi.fn(),
    destination: '東京',
    viewerMemberId: OWNER,
    members,
  }, over) as unknown as React.ComponentProps<typeof TripLiveOverview>;
  render(<TripLiveOverview {...props} />);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const shown = () => (screen.getByText(/^NT\$/).textContent || '').replace(/[^\d]/g, '');

describe('今日花費', () => {
  /* 882 split two ways: his half, not the bill. */
  it('counts half of a bill he split', () => {
    mount([expense({ id: 'a', twdAmount: 882, beneficiaries: [OWNER, HER] })]);

    expect(shown()).toBe('441');
  });

  /* A bill she paid for herself is none of his money. */
  it('counts nothing of a bill that is hers alone', () => {
    mount([expense({ id: 'b', twdAmount: 76, payerId: HER, beneficiaries: [HER] })]);

    expect(shown()).toBe('0');
  });

  it('counts the whole of a bill that is only his', () => {
    mount([expense({ id: 'c', twdAmount: 151, beneficiaries: [OWNER] })]);

    expect(shown()).toBe('151');
  });

  /*
    Without a viewer the full amount is still the honest answer: a solo ledger
    has nobody to apportion to, and quietly reporting a fraction there would
    understate what somebody spent.
  */
  it('falls back to the whole bill when nobody is identified', () => {
    mount(
      [expense({ id: 'a', twdAmount: 882, beneficiaries: [OWNER, HER] })],
      { viewerMemberId: undefined, members: [] },
    );

    expect(shown()).toBe('882');
  });

  it('leaves out a day that is not today', () => {
    mount([expense({ id: 'd', twdAmount: 500, date: '2026-10-19', beneficiaries: [OWNER] })]);

    expect(shown()).toBe('0');
  });
});
