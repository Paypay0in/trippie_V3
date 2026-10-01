/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTripSync } from '../hooks/useTripSync';
import * as tripSync from '../services/tripSync';
import { Expense, ItineraryItem } from '../types';

const expense = { id: 'expense-local', description: 'local', amount: 1 } as Expense;
const itineraryItem = { id: 'item-local', title: 'local' } as ItineraryItem;
const emptySnapshot: tripSync.TripSyncSnapshot = {
  members: [],
  expenses: [],
  itinerary: [],
  flightAnchors: [],
};

const Harness: React.FC<{ initialExpenses?: Expense[]; initialItinerary?: ItineraryItem[] }> = ({
  initialExpenses = [expense],
  initialItinerary = [itineraryItem],
}) => {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [itinerary, setItinerary] = useState(initialItinerary);
  const state = useTripSync({
    tripId: 'trip-sync-test',
    authUserId: 'user-sync-test',
    tripName: '釜山',
    members: [],
    expenses,
    itinerary,
    flightAnchors: [],
    onRemoteSnapshot: snapshot => {
      setExpenses(snapshot.expenses);
      setItinerary(snapshot.itinerary);
    },
  });

  return <div data-testid="sync-state">{state}:{expenses.length}:{itinerary.length}</div>;
};

beforeEach(() => {
  vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
  vi.spyOn(tripSync, 'pushTripSnapshot').mockResolvedValue({ status: 'ok', data: null });
});

afterEach(() => {
  cleanup();
  document.getElementById('trippie-sync-badge')?.remove();
  vi.restoreAllMocks();
});

describe('trip sync bootstrap', () => {
  it('retries a failed first read on focus without allowing an early push', async () => {
    vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } });
    vi.spyOn(tripSync, 'fetchTripSnapshot')
      .mockResolvedValueOnce({ status: 'error', message: 'temporary network failure' })
      .mockResolvedValue({ status: 'ok', data: emptySnapshot });

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('error:1:1'));
    expect(tripSync.pushTripSnapshot).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('synced:0:0'));
    expect(tripSync.fetchTripSnapshot).toHaveBeenCalledTimes(2);
  });

  it('treats empty lists on an existing trip as authoritative', async () => {
    vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } });
    vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({ status: 'ok', data: emptySnapshot });

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('synced:0:0'));
  });

  it('applies deletion of the last remote expense and itinerary on reread', async () => {
    const populated: tripSync.TripSyncSnapshot = {
      ...emptySnapshot,
      expenses: [expense],
      itinerary: [itineraryItem],
    };
    vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } });
    vi.spyOn(tripSync, 'fetchTripSnapshot')
      .mockResolvedValueOnce({ status: 'ok', data: populated })
      .mockResolvedValue({ status: 'ok', data: emptySnapshot });

    render(<Harness initialExpenses={[]} initialItinerary={[]} />);
    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('synced:1:1'));

    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('synced:0:0'));
  });

  it('preserves and publishes a local draft after creating the cloud trip', async () => {
    vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: true } });
    vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({ status: 'ok', data: emptySnapshot });

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('sync-state').textContent).toBe('synced:1:1'));
    await waitFor(() => expect(tripSync.pushTripSnapshot).toHaveBeenCalled(), { timeout: 2_000 });
    expect(tripSync.pushTripSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ expenses: [expense], itinerary: [itineraryItem] }),
      'trip-sync-test',
      expect.any(Object),
    );
  });
});
