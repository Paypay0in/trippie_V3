/**
 * @vitest-environment jsdom
 *
 * What a shared trip's bills are filed as, after the cloud copy lands.
 *
 * 「這些歸帳」「要按照日期」. The local re-file worked and was undone seconds
 * later: 釜山 is a 共用 trip, so every open hydrates from Supabase, and
 * `setExpenses(snapshot.expenses)` put back the stage that had been guessed
 * from the category. The bill bought on 10/03 returned to 回國機場消費 on a trip
 * running 10/02–10/07, every single time, which is why the screen never moved.
 *
 * This covers the hydrate handler's contract: what arrives from the cloud is
 * filed by date on the way in, exactly like a receipt imported on this device.
 */
import React, { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTripSync } from '../hooks/useTripSync';
import * as tripSync from '../services/tripSync';
import { refileExpensePhasesByDate } from '../services/expensePhaseForDate';
import { Category, Expense } from '../types';

const BUSAN = { startDate: '2026-10-02', endDate: '2026-10-07' };

const remoteBill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'olive-young',
    description: 'OLIVE YOUNG 美妝保養品',
    amount: 408,
    category: Category.COSMETICS,
    // What the cloud row carries: filed by category, before the date rule.
    phase: 'post',
    date: '2026-10-03',
    ...over,
  }) as Expense;

const snapshotOf = (expenses: Expense[]): tripSync.TripSyncSnapshot => ({
  members: [],
  expenses,
  itinerary: [],
  flightAnchors: [],
});

/** The handler as App.tsx now writes it. */
const Harness: React.FC<{ window?: { startDate: string; endDate: string } }> = ({
  window: tripWindow = BUSAN,
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const state = useTripSync({
    tripId: 'busan',
    authUserId: 'north',
    tripName: '釜山',
    members: [],
    expenses,
    itinerary: [],
    flightAnchors: [],
    onRemoteSnapshot: (snapshot) => {
      setExpenses(refileExpensePhasesByDate(snapshot.expenses, tripWindow));
    },
  });

  return (
    <div data-testid="hydrated">
      {state}:{expenses.map((e) => e.phase).join(',') || '-'}
    </div>
  );
};

beforeEach(() => {
  vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
  vi.spyOn(tripSync, 'pushTripSnapshot').mockResolvedValue({ status: 'ok', data: null });
  vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } });
});

afterEach(() => {
  cleanup();
  document.getElementById('trippie-sync-badge')?.remove();
  vi.restoreAllMocks();
});

describe('雲端快照回來的時候', () => {
  it('10/03 的帳不會被雲端的舊 phase 拉回回國機場消費', async () => {
    vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({
      status: 'ok',
      data: snapshotOf([remoteBill()]),
    });

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('hydrated').textContent).toBe('synced:during'),
    );
  });

  it('真正在回國後買的，雲端回來還是回國機場消費', async () => {
    vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({
      status: 'ok',
      data: snapshotOf([remoteBill({ id: 'airport', date: '2026-10-08' })]),
    });

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('hydrated').textContent).toBe('synced:post'),
    );
  });
});
