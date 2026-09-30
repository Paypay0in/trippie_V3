/**
 * @vitest-environment jsdom
 *
 * 「行程依然在下面產出 並且一下就消失了 無法新增」.
 *
 * The adjustment preview is dropped whenever the itinerary moves underneath it,
 * which is right: 「原本：09:00」 must not stay on screen once that item is at
 * 11:30. What it must not do is treat the same plan, listed in a different
 * order, as a change — and that is exactly what a trip open on two phones
 * produces. The cloud re-read runs every twenty seconds and replaces the
 * itinerary with the server's copy, and Postgres returns rows in whatever order
 * it likes, which moves after any write. So the preview was torn down seconds
 * after it appeared, with nothing having changed at all.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ItineraryItem } from '../types';

const TRIP_START = '2026-10-01';
const TRIP_END = '2026-10-03';

vi.mock('../services/itineraryAdjustment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/itineraryAdjustment')>();
  return {
    ...actual,
    generateItineraryAdjustment: vi.fn(async () => ({
      mode: 'reorder' as const,
      summary: '調順動線。',
      changes: [
        { type: 'move' as const, existingItemId: 'it-a', fromTime: '09:00', toTime: '11:30', reason: '配合晚出門' },
      ],
      warnings: [],
    })),
  };
});

const itinerary: ItineraryItem[] = [
  { id: 'it-a', date: TRIP_START, time: '09:00', title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
  { id: 'it-b', date: TRIP_START, time: '13:00', title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY' },
  { id: 'it-c', date: TRIP_START, time: '17:00', title: '國際市場', location: '國際市場', notes: '', type: 'ACTIVITY' },
];

const trip = {
  destination: '釜山',
  destinationCountry: '韓國',
  travelCountry: '韓國',
  startDate: TRIP_START,
  endDate: TRIP_END,
};

const planner = async (items: ItineraryItem[]) => {
  const { default: TripInspirationPlanner } = await import('../components/TripInspirationPlanner');
  return (
    <TripInspirationPlanner
      inspirations={[]}
      communityPosts={[]}
      trip={trip as never}
      selectedGroupIds={[]}
      onSelectionChange={() => {}}
      onExploreCommunity={() => {}}
      existingItinerary={items}
      onAcceptProposal={async () => ({ ok: true }) as never}
      onApplyAdjustment={async () => ({ ok: true }) as never}
      onProposalAccepted={() => {}}
    />
  );
};

/** Generates an adjustment and waits for the preview to be on screen. */
const generate = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('radio', { name: /重新安排路線/ }));
  await user.click(screen.getByText('AI 幫我調整行程'));
  await waitFor(() => expect(screen.getByText('套用這些調整')).toBeTruthy());
};

afterEach(() => cleanup());

describe('the adjustment preview survives a cloud re-read', () => {
  it('stays on screen when the same items arrive in a different order', async () => {
    const user = userEvent.setup();
    const { rerender } = render(await planner(itinerary));
    await generate(user);

    // What a re-read hands down: the same three items, server order.
    rerender(await planner([itinerary[2], itinerary[0], itinerary[1]]));

    expect(screen.getByText('套用這些調整')).toBeTruthy();
  });

  it('still discards it when an item genuinely moves', async () => {
    const user = userEvent.setup();
    const { rerender } = render(await planner(itinerary));
    await generate(user);

    // 「原本：09:00」 is no longer true, so the preview must go.
    rerender(await planner([{ ...itinerary[0], time: '10:00' }, itinerary[1], itinerary[2]]));

    await waitFor(() => expect(screen.queryByText('套用這些調整')).toBeNull());
  });

  it('still discards it when an item is deleted elsewhere', async () => {
    const user = userEvent.setup();
    const { rerender } = render(await planner(itinerary));
    await generate(user);

    rerender(await planner([itinerary[0], itinerary[1]]));

    await waitFor(() => expect(screen.queryByText('套用這些調整')).toBeNull());
  });
});
