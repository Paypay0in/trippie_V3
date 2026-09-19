/**
 * @vitest-environment jsdom
 *
 * A proposal the traveller is looking at must survive the app learning things
 * about the trip it was already planning for.
 *
 * The planner drops a pending proposal whenever the destination or the chosen
 * places move underneath it, which is right: figures for one destination must
 * not sit on screen while another is selected. What it must not do is treat
 * "the same trip, described again" as a change. Destination coordinates and a
 * place id resolve asynchronously, so a lookup landing a moment after the
 * proposal rendered would tear it down — the accept button vanishing under a
 * finger already on its way to it, and only sometimes, depending on when the
 * network answered.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedTravelInspiration } from '../types';
import { selectTripInspirationGroups } from '../services/tripInspirationSelection';

const TRIP_START = '2026-10-01';
const TRIP_END = '2026-10-03';

vi.mock('../services/itineraryPlanningService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/itineraryPlanningService')>();
  return {
    ...actual,
    generateTripInspirationProposal: vi.fn(async () => ({
      days: [{
        date: TRIP_START,
        items: [{
          placeName: '淺草寺',
          placeId: 'place-asakusa',
          suggestedStartTime: '09:00',
          note: '早上人少',
          source: 'saved_inspiration' as const,
          sourceInspirationIds: ['insp-1'],
          durationMinutes: 90,
        }],
      }],
      warnings: [],
      notes: [],
    })),
  };
});

const inspirations: SavedTravelInspiration[] = [{
  id: 'insp-1',
  savedByUserId: 'user-1',
  country: '日本',
  city: '東京',
  placeName: '淺草寺',
  placeId: 'place-asakusa',
  sourcePostId: 'post-1',
  sourceSliceId: 'slice-1',
  sourceCreatorId: 'creator-1',
  sourceNoteIds: ['note-1'],
  savedAt: '2026-09-01T00:00:00.000Z',
  notes: [],
}];

/**
 * Derived rather than hardcoded: the grouping key is the selection service's
 * business, and a test that guessed it would fail for the wrong reason the day
 * that changed.
 */
const selectedGroupIds = selectTripInspirationGroups(inspirations, {
  destination: '東京',
  destinationCountry: '日本',
  travelCountry: '日本',
} as never).map(group => group.id);

/** The same trip, every time — only the object identity is new. */
const tripContext = (extra: Record<string, unknown> = {}) => ({
  destination: '東京',
  destinationCountry: '日本',
  travelCountry: '日本',
  startDate: TRIP_START,
  endDate: TRIP_END,
  ...extra,
});

const renderPlanner = async (trip: ReturnType<typeof tripContext>) => {
  const { default: TripInspirationPlanner } = await import('../components/TripInspirationPlanner');
  return render(
    <TripInspirationPlanner
      inspirations={inspirations}
      communityPosts={[]}
      trip={trip as never}
      selectedGroupIds={selectedGroupIds}
      onSelectionChange={() => {}}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={async () => ({ status: 'ok' }) as never}
      onApplyAdjustment={async () => ({ status: 'ok' }) as never}
      onProposalAccepted={() => {}}
    />,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a pending proposal survives the trip being re-described', () => {
  it('stays on screen when coordinates resolve after it rendered', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderPlanner(tripContext());

    await user.click(screen.getByText(/AI 幫我排行程/));
    await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());

    // The destination lookup lands: same destination, now with coordinates and
    // a resolved place id. This is the app learning where 東京 is, not the
    // traveller choosing somewhere else.
    const { default: TripInspirationPlanner } = await import('../components/TripInspirationPlanner');
    rerender(
      <TripInspirationPlanner
        inspirations={inspirations}
        communityPosts={[]}
        trip={tripContext({
          destinationLatitude: 35.6762,
          destinationLongitude: 139.6503,
          destinationPlaceId: 'place-tokyo',
        }) as never}
        selectedGroupIds={selectedGroupIds}
        onSelectionChange={() => {}}
        onExploreCommunity={() => {}}
        existingItinerary={[]}
        onAcceptProposal={async () => ({ status: 'ok' }) as never}
        onApplyAdjustment={async () => ({ status: 'ok' }) as never}
        onProposalAccepted={() => {}}
      />,
    );

    expect(screen.getByText('接受這份行程')).toBeTruthy();
  });

  it('stays on screen across a render that changed nothing at all', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderPlanner(tripContext());

    await user.click(screen.getByText(/AI 幫我排行程/));
    await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());

    // A parent re-rendering for an unrelated reason hands down a fresh object
    // with identical contents. Nothing about the trip moved.
    const { default: TripInspirationPlanner } = await import('../components/TripInspirationPlanner');
    rerender(
      <TripInspirationPlanner
        inspirations={[...inspirations]}
        communityPosts={[]}
        trip={tripContext() as never}
        selectedGroupIds={selectedGroupIds}
        onSelectionChange={() => {}}
        onExploreCommunity={() => {}}
        existingItinerary={[]}
        onAcceptProposal={async () => ({ status: 'ok' }) as never}
        onApplyAdjustment={async () => ({ status: 'ok' }) as never}
        onProposalAccepted={() => {}}
      />,
    );

    expect(screen.getByText('接受這份行程')).toBeTruthy();
  });

  it('still discards the proposal when the destination genuinely changes', async () => {
    // The guard this bug hides behind is a real one: figures planned for 東京
    // must not stay on screen once the trip is to 大阪.
    const user = userEvent.setup();
    const { rerender } = await renderPlanner(tripContext());

    await user.click(screen.getByText(/AI 幫我排行程/));
    await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());

    const { default: TripInspirationPlanner } = await import('../components/TripInspirationPlanner');
    rerender(
      <TripInspirationPlanner
        inspirations={inspirations}
        communityPosts={[]}
        trip={tripContext({ destination: '大阪' }) as never}
        selectedGroupIds={selectedGroupIds}
        onSelectionChange={() => {}}
        onExploreCommunity={() => {}}
        existingItinerary={[]}
        onAcceptProposal={async () => ({ status: 'ok' }) as never}
        onApplyAdjustment={async () => ({ status: 'ok' }) as never}
        onProposalAccepted={() => {}}
      />,
    );

    await waitFor(() => expect(screen.queryByText('接受這份行程')).toBeNull());
  });
});
