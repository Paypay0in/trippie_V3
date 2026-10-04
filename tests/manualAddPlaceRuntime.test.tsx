/**
 * @vitest-environment jsdom
 *
 * 「這裡要有可以手動加入的功能」.
 *
 * The collection could only be filled from a screenshot, so a place somebody
 * simply knows about — recommended over dinner, remembered from last time —
 * had to be screenshotted before it could be saved.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

const SUGGESTIONS = [
  { placeId: 'g-dangol', primaryText: '단골손님', secondaryText: '南韓釜山中區 BIFF廣場路' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (String(url).includes('/api/places/autocomplete')) {
      return { ok: true, json: async () => ({ suggestions: SUGGESTIONS }) };
    }
    if (String(url).includes('/api/places/details')) {
      return {
        ok: true,
        json: async () => ({
          placeId: body.placeId, location: '단골손님',
          address: '南韓釜山中區 BIFF廣場路 1', latitude: 35.0982, longitude: 129.0292,
        }),
      };
    }
    return { ok: true, json: async () => ({ basics: null }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPlanner = (over: Record<string, unknown> = {}) => {
  const onAddSavedPlace = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={[]}
      communityPosts={[]}
      trip={{ destination: '韓國', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
      selectedGroupIds={[]}
      onSelectionChange={vi.fn()}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
      onAddSavedPlace={onAddSavedPlace}
      {...over}
    />,
  );
  return { onAddSavedPlace };
};

describe('adding a place by hand', () => {
  it('offers the control', () => {
    renderPlanner();

    expect(screen.getByTestId('open-add-place')).toBeTruthy();
  });

  it('searches for what was typed', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByTestId('open-add-place'));
    await user.type(screen.getByTestId('add-place-input'), '단골손님');
    await user.click(screen.getByTestId('add-place-search'));

    expect(await screen.findByTestId('add-place-pick-g-dangol')).toBeTruthy();
  });

  it('saves nothing until a candidate is picked', async () => {
    // The same rule the repair flow follows: a search result is a guess until
    // a person says which one it is.
    const user = userEvent.setup();
    const { onAddSavedPlace } = renderPlanner();

    await user.click(screen.getByTestId('open-add-place'));
    await user.type(screen.getByTestId('add-place-input'), '단골손님');
    await user.click(screen.getByTestId('add-place-search'));
    await screen.findByTestId('add-place-pick-g-dangol');

    expect(onAddSavedPlace).not.toHaveBeenCalled();
  });

  it('saves the place the traveller picked, with its identity', async () => {
    const user = userEvent.setup();
    const { onAddSavedPlace } = renderPlanner();

    await user.click(screen.getByTestId('open-add-place'));
    await user.type(screen.getByTestId('add-place-input'), '단골손님');
    await user.click(screen.getByTestId('add-place-search'));
    await user.click(await screen.findByTestId('add-place-pick-g-dangol'));

    expect(onAddSavedPlace).toHaveBeenCalledWith(expect.objectContaining({
      placeId: 'g-dangol', placeName: '단골손님', latitude: 35.0982,
    }));
  });

  it('hides the control when the caller offers no way to save', () => {
    renderPlanner({ onAddSavedPlace: undefined });

    expect(screen.queryByTestId('open-add-place')).toBeNull();
  });
});
