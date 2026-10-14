/**
 * @vitest-environment jsdom
 *
 * 「你做」 — the backfill, in the screen, not only in the predicate.
 *
 * What it must not do is as important as what it does: it is the traveller's
 * own saved places being rewritten, so it runs on a tap and never on load.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';
import { SavedTravelInspiration } from '../types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The measured answer for 「らぁ麺や 嶋」 from the live resolve route. */
const RESOLVED = {
  placeId: 'ChIJTT3M7M7zGGARwooMR53XFLE',
  resolvedPlaceName: 'らぁ麺や 嶋',
  address: '3-chōme-41-11 Honmachi, Shibuya, Tokyo 151-0071日本',
  latitude: 35.6883441,
  longitude: 139.6808875,
  country: '日本',
  city: 'Shibuya',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => RESOLVED })) as never);
});

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: 'me',
  placeName: 'らぁ麺や 嶋',
  country: '日本',
  city: '日本',
  notes: [],
  ...over,
} as SavedTravelInspiration);

const mount = (inspirations: SavedTravelInspiration[]) => {
  const onResolveInspirationPlace = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={inspirations}
      communityPosts={[]}
      trip={{ destination: '東京', destinationCountry: '日本' } as never}
      selectedGroupIds={[]}
      onSelectionChange={vi.fn()}
      existingItinerary={[]}
      onExploreCommunity={vi.fn()}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
      onResolveInspirationPlace={onResolveInspirationPlace}
    />,
  );
  return { onResolveInspirationPlace };
};

describe('the backfill offer', () => {
  it('counts the saves that do not know where they are', () => {
    mount([saved(), saved({ id: 'i2', placeName: 'Hills House' })]);

    expect(screen.getByTestId('place-backfill').textContent).toContain('2');
  });

  it('is absent when every save already knows', () => {
    mount([saved({ formattedAddress: '東京都渋谷区…', city: 'Shibuya' })]);

    expect(screen.queryByTestId('place-backfill')).toBeNull();
  });

  /*
    Twenty lookups the traveller did not ask for, charged to their key, is not
    a thing to start on its own.
  */
  it('looks nothing up until it is tapped', () => {
    mount([saved()]);

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('running it', () => {
  it('writes the town it found onto the save', async () => {
    const { onResolveInspirationPlace } = mount([saved()]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(onResolveInspirationPlace).toHaveBeenCalled());
    const [ids, resolved, options] = onResolveInspirationPlace.mock.calls[0];
    expect(ids).toEqual(['i1']);
    expect(resolved.city).toBe('Shibuya');
    expect(resolved.address).toContain('Shibuya');
    // Twenty corrections must not raise twenty toasts.
    expect(options?.silent).toBe(true);
  });

  it('says how it went', async () => {
    mount([saved()]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(screen.getByTestId('place-backfill-done').textContent).toContain('1'));
  });

  /** A name Google cannot place is reported, not silently counted as done. */
  it('counts the ones it could not find', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never);
    const { onResolveInspirationPlace } = mount([saved()]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(screen.getByTestId('place-backfill-done').textContent).toContain('查不到'));
    expect(onResolveInspirationPlace).not.toHaveBeenCalled();
  });
});
