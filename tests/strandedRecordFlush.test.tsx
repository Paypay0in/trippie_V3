/**
 * @vitest-environment jsdom
 *
 * A record whose first push failed has to get a second chance.
 *
 * Pushes fire when the ledger changes. So an expense recorded while the server
 * was refusing this device's writes had nothing left to ride on: the content
 * was already local, the next read merged it back unchanged, and the signature
 * never moved again. Hers sat on her phone for an hour, and the only way out
 * was to go and edit it until something looked different.
 *
 * Opening the trip now publishes once, which is an upsert of what this device
 * is already holding against a snapshot it has just read — it adds nothing and
 * removes nothing, and it carries the stranded record up.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useTripSync } from '../hooks/useTripSync';
import type { Expense } from '../types';

const pushed: Array<{ expenses: Expense[] }> = [];

vi.mock('../services/tripSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/tripSync')>();
  return {
    ...actual,
    isSyncAvailable: () => true,
    ensureTripRow: async () => ({ status: 'ok', data: { created: false } }),
    // The server has the two expenses the owner wrote, and not hers.
    fetchTripSnapshot: async () => ({
      status: 'ok',
      data: {
        members: [{ id: 'trip:owner', name: 'Ann', type: 'owner' }],
        expenses: [{ id: 'e-esim' } as Expense, { id: 'e-flight' } as Expense],
        itinerary: [],
        flightAnchors: [],
      },
    }),
    pushTripSnapshot: async (snapshot: { expenses: Expense[] }) => {
      pushed.push({ expenses: snapshot.expenses });
      return { status: 'ok', data: null };
    },
  };
});

/** Her device: the two it read, plus the one that never made it up. */
const localExpenses = [
  { id: 'e-esim' } as Expense,
  { id: 'e-flight' } as Expense,
  { id: 'e-stranded' } as Expense,
];

const Harness: React.FC = () => {
  useTripSync({
    tripId: 'trip-1',
    authUserId: 'account-gina',
    tripName: '釜山',
    members: [],
    expenses: localExpenses,
    itinerary: [],
    flightAnchors: [],
    onRemoteSnapshot: () => undefined,
  });
  return null;
};

beforeEach(() => {
  pushed.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe('opening a trip', () => {
  it('publishes what this device is holding, without being edited first', async () => {
    render(<Harness />);

    await waitFor(() => expect(pushed.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(pushed[0].expenses.map(expense => expense.id)).toContain('e-stranded');
  });
});
