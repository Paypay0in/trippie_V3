/**
 * @vitest-environment jsdom
 *
 * 「這頁之前有Ai協助排行程的區塊 怎麼消失了」.
 *
 * It had not been removed. A trip with nothing saved and nothing planned
 * renders the empty collection state and nothing else: 「AI 幫我排行程」 lives
 * inside the branch that draws the saved places, and 「AI 行程調整模式」 only
 * appears once the trip already has an itinerary.
 *
 * The screenshot entry was inside that second block — so the way to put the
 * first thing into a trip was behind having already put something in it. An
 * empty trip was a dead end, and the only screen that could tell anybody was
 * a freshly created one.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

afterEach(cleanup);

/** A trip the traveller has just created: nothing saved, nothing planned. */
const renderEmptyTrip = (overrides: Record<string, unknown> = {}) => render(
  <TripInspirationPlanner
    inspirations={[]}
    communityPosts={[]}
    trip={{
      destination: '沖繩',
      destinationCountry: '日本',
      startDate: '2026-11-01',
      endDate: '2026-11-05',
    } as never}
    selectedGroupIds={[]}
    onSelectionChange={vi.fn()}
    onExploreCommunity={vi.fn()}
    existingItinerary={[]}
    onAcceptProposal={vi.fn()}
    onApplyAdjustment={vi.fn()}
    onProposalAccepted={vi.fn()}
    onRemoveInspirations={vi.fn()}
    onAddItineraryItems={vi.fn()}
    onSaveScreenshotPlaces={vi.fn()}
    {...overrides}
  />,
);

describe('a trip with nothing in it yet', () => {
  it('still offers the screenshot upload', () => {
    renderEmptyTrip();

    // The empty state is the whole screen at this point, so this is the only
    // way in that does not require the traveller to have been here before.
    expect(screen.getByText('目前沒有這個目的地的收藏靈感')).toBeTruthy();
    expect(screen.getByTestId('screenshot-intake')).toBeTruthy();
  });

  /**
   * The gate that hid it. Rendering is asserted against both values so the
   * entry cannot drift back inside a block that depends on the itinerary.
   */
  it('offers it whether or not the trip already has a plan', () => {
    renderEmptyTrip();
    expect(screen.getByTestId('screenshot-intake')).toBeTruthy();
    cleanup();

    renderEmptyTrip({
      existingItinerary: [
        { id: 'i-1', date: '2026-11-01', title: '那霸機場', type: 'transport' },
      ],
    });
    expect(screen.getByTestId('screenshot-intake')).toBeTruthy();
  });
});
