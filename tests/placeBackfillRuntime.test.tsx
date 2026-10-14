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

/**
 * 「這個是韓國釜山 不是加拿大」.
 *
 * `/api/places/resolve` uses the country to rank, not to filter, so a strong
 * text match elsewhere wins outright: 「Working holiday」 — a note's title, not
 * a place — resolves to 「Global Work & Travel Canada」 in Vancouver even when
 * asked for in Korea. Measured against the live route.
 */
describe('a match that lands in another country', () => {
  const VANCOUVER = {
    placeId: 'ChIJ7zvdl4dxhlQRItGrlhpIS6s',
    resolvedPlaceName: 'Global Work & Travel Canada',
    address: '333 Seymour St Level 8, Vancouver, BC V6B 5A6加拿大',
    latitude: 49.2853846,
    longitude: -123.1124584,
    country: '加拿大',
    city: 'Vancouver',
  };

  it('is refused rather than written onto a Korean save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => VANCOUVER })) as never);
    const { onResolveInspirationPlace } = mount([
      saved({ placeName: 'Working holiday', country: '韓國', city: '韓國' }),
    ]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    const done = await screen.findByTestId('place-backfill-done');
    await waitFor(() => expect(done.textContent).toContain('查不到'));
    expect(onResolveInspirationPlace).not.toHaveBeenCalled();
  });

  /* The same country in another language is still the same country. */
  it('accepts a match whose country is spelled differently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...VANCOUVER, country: 'Korea', city: 'Busan' }),
    })) as never);
    const { onResolveInspirationPlace } = mount([
      saved({ placeName: '해운대', country: '韓國', city: '韓國' }),
    ]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(onResolveInspirationPlace).toHaveBeenCalled());
    expect(onResolveInspirationPlace.mock.calls[0][1].city).toBe('Busan');
  });

  /** A save that never said where it is has nothing to contradict. */
  it('accepts anything for a save with no country', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => VANCOUVER })) as never);
    const { onResolveInspirationPlace } = mount([
      saved({ placeName: 'Working holiday', country: '', city: '' }),
    ]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(onResolveInspirationPlace).toHaveBeenCalled());
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

  /** 「我要去哪點入搜尋？」 — a count does not say which two. */
  it('names the ones it could not find', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never);
    const { onResolveInspirationPlace } = mount([saved()]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    const done = await screen.findByTestId('place-backfill-done');
    await waitFor(() => expect(done.textContent).toContain('查不到'));
    expect(done.textContent).toContain('らぁ麺や 嶋');
    expect(done.textContent).toContain('在地圖上尋找這個地點');
    expect(onResolveInspirationPlace).not.toHaveBeenCalled();
  });
});

/**
 * 「沒有的話 app 要問用戶是哪個國家」.
 *
 * A trip with no country reads every address with no conventions, groups every
 * saved note under one card, and cannot tell whether its transit can be
 * answered at all. It is detected from the destination, from the trip's name
 * and from the ticket — and when all three say nothing, asking is the only
 * honest move. Guessing is how a trip to Tokyo gets Busan's district rules.
 */
describe('a trip with no country', () => {
  const mountWith = (onPickCountry?: () => void) => {
    render(
      <TripInspirationPlanner
        inspirations={[]}
        communityPosts={[]}
        trip={{ destination: '沖繩' } as never}
        selectedGroupIds={[]}
        onSelectionChange={vi.fn()}
        existingItinerary={[]}
        onExploreCommunity={vi.fn()}
        onAcceptProposal={vi.fn()}
        onApplyAdjustment={vi.fn()}
        onProposalAccepted={vi.fn()}
        onPickCountry={onPickCountry}
      />,
    );
  };

  it('asks, with a way to answer', () => {
    const onPickCountry = vi.fn();
    mountWith(onPickCountry);

    expect(screen.getByTestId('country-missing').textContent).toContain('還沒設定國家');

    fireEvent.click(screen.getByTestId('pick-country'));
    expect(onPickCountry).toHaveBeenCalled();
  });

  /*
    The caller decides, because it is the only thing that can see the ticket —
    a trip named 沖繩 with an NRT boarding pass already knows it is in Japan.
  */
  it('says nothing when the caller did not offer', () => {
    mountWith(undefined);

    expect(screen.queryByTestId('country-missing')).toBeNull();
  });
});
