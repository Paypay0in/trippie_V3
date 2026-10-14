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
import { CATEGORY_RULES } from '../services/placeCategory';

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
    // Stamped: a record never put through the current lookup is offered
    // whatever its city looks like. See `resolvedSinceTheSplit`.
    mount([saved({
      formattedAddress: '東京都渋谷区…', city: 'Tokyo', district: 'Shibuya',
      placeResolvedAt: '2026-10-14T10:00:00.000Z', category: 'sight', categoryRules: CATEGORY_RULES,
    })]);

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

  /*
    This test used to assert the opposite — 「a save that never said where it is
    has nothing to contradict」 — and that is the bug: 「怎麼越弄越糟 我的釜山都不見
    了 還出現美國跟加拿大的」. The saves with no country are precisely the ones
    this repair runs over, so the guard excused itself for every record it was
    supposed to protect, and Vancouver was written onto Busan.

    The open trip's country stands in. The trip here is 東京/日本, so Vancouver
    is refused for a save that names nothing.
  */
  it('holds a save with no country to the open trip\'s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => VANCOUVER })) as never);
    const { onResolveInspirationPlace } = mount([
      saved({ placeName: 'Working holiday', country: '', city: '' }),
    ]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    const done = await screen.findByTestId('place-backfill-done');
    await waitFor(() => expect(done.textContent).toContain('查不到'));
    expect(onResolveInspirationPlace).not.toHaveBeenCalled();
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

/**
 * 「唉 要全刪了」.
 *
 * The alternative to repointing five damaged records by hand was throwing the
 * collection away. It is not a real choice: the lookup writes
 * `resolvedPlaceName` and never touches `placeName` or the notes, so undoing
 * the binding costs nothing.
 */
describe('putting a stranded save back to unresolved', () => {
  const mountWithTrips = (inspirations: SavedTravelInspiration[]) => {
    const onUnbindInspirationPlaces = vi.fn();
    render(
      <TripInspirationPlanner
        inspirations={inspirations}
        communityPosts={[]}
        trip={{ destination: '釜山', destinationCountry: '韓國' } as never}
        knownCountries={['韓國']}
        selectedGroupIds={[]}
        onSelectionChange={vi.fn()}
        existingItinerary={[]}
        onExploreCommunity={vi.fn()}
        onAcceptProposal={vi.fn()}
        onApplyAdjustment={vi.fn()}
        onProposalAccepted={vi.fn()}
        onUnbindInspirationPlaces={onUnbindInspirationPlaces}
      />,
    );
    return { onUnbindInspirationPlaces };
  };

  /** The measured damage, as it sits in his collection. */
  const damaged = saved({
    id: 'broken',
    placeName: 'Working holiday',
    resolvedPlaceName: 'Global Work & Travel Canada',
    country: '加拿大',
    city: 'Vancouver',
    formattedAddress: '333 Seymour St Level 8, Vancouver, BC V6B 5A6加拿大',
    placeResolvedAt: '2026-10-14T09:00:00.000Z',
  });

  it('lists it and offers the undo for exactly those ids', () => {
    const { onUnbindInspirationPlaces } = mountWithTrips([
      damaged,
      saved({ id: 'fine', placeName: 'Photowave', country: '韓國', city: '釜山' }),
    ]);

    expect(screen.getByTestId('stranded-saves').textContent).toContain('加拿大');

    fireEvent.click(screen.getByTestId('unbind-stranded'));
    expect(onUnbindInspirationPlaces).toHaveBeenCalledWith(['broken']);
  });

  /* Nothing to undo is nothing to show. */
  it('is absent when every save is in a country he has a trip to', () => {
    mountWithTrips([saved({ country: '韓國', city: '釜山' })]);

    expect(screen.queryByTestId('stranded-saves')).toBeNull();
  });
});

/**
 * 「沒有補標籤」.
 *
 * 補齊 ran over 54 places, fetched each one's category, and threw it away: this
 * call site builds its object field by field, so a field added to the handler's
 * signature does nothing here until it is named. The row's own lookup hands the
 * whole resolved place over and got the tag for free. Two paths, one doing less
 * — the same shape as every other bug this week.
 */
describe('what the backfill hands on', () => {
  it('carries the category Google already told it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...RESOLVED, primaryType: 'ramen_restaurant' }),
    })) as never);
    const { onResolveInspirationPlace } = mount([saved()]);

    fireEvent.click(screen.getByTestId('run-place-backfill'));

    await waitFor(() => expect(onResolveInspirationPlace).toHaveBeenCalled());
    expect(onResolveInspirationPlace.mock.calls[0][1].primaryType).toBe('ramen_restaurant');
  });
});
