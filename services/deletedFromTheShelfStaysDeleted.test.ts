/**
 * @vitest-environment jsdom
 *
 * 「我剛剛刪除了首爾的收藏 又跑回來了」 —— deleted from the home screen, back again.
 *
 * The fourth door onto the same sentence. The three before it were all inside
 * a trip: merging could not express a deletion, the prune was skipped when no
 * row changed, and the prune named this phone's id instead of the server's.
 * All three are fixed, and all three only run while the trip that owns the
 * place is open and syncing.
 *
 * Deleting from 儲存的旅行筆記 is neither. `removeSavedTravelInspiration`
 * filtered local state; the server kept the row; the next sync of the Korea
 * trip replaced this trip's places with the server's copy and handed it back.
 *
 * The fix has to survive that replacement, which means it cannot live in the
 * sync at all — the sync was never told. It is a tombstone, read where the
 * server's copy is applied.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DELETED_SAVED_PLACES_STORAGE_KEY,
  deletedSavedPlaceKeys,
  reconcileDeletedSavedPlaces,
  rememberDeletedSavedPlaces,
  withoutDeletedSavedPlaces,
} from './deletedSavedPlaces';
import { applyTripInspirations } from './applyTripInspirations';
import { idsToPrune } from './syncPrune';
import { SavedTravelInspiration } from '../types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const place = (id: string, placeName: string, placeId?: string): SavedTravelInspiration => ({
  id,
  savedByUserId: 'me',
  placeName,
  placeId,
  country: '韓國',
  city: '首爾',
  notes: [],
  savedAt: '2026-11-01T00:00:00.000Z',
} as SavedTravelInspiration);

const korea = (inspiration: SavedTravelInspiration) => inspiration.country === '韓國';

beforeEach(() => {
  localStorage.removeItem(DELETED_SAVED_PLACES_STORAGE_KEY);
});

describe('deleting a saved place from the shelf', () => {
  it('keeps it off the shelf when the trip syncs the server copy back', () => {
    const deleted = place('local-seoul', '단골손님', 'place-seoul');
    rememberDeletedSavedPlaces([deleted]);

    // The server still holds the row: nothing has told it otherwise yet.
    const fromServer = [place('remote-seoul', '단골손님', 'place-seoul'), place('remote-keep', '광장시장', 'place-market')];

    const applied = applyTripInspirations(
      [place('local-keep', '광장시장', 'place-market')],
      withoutDeletedSavedPlaces(fromServer),
      korea,
    );

    expect(applied.map(entry => entry.placeName)).toEqual(['광장시장']);
  });

  it('lets the next push prune the row the server is still holding', () => {
    rememberDeletedSavedPlaces([place('local-seoul', '단골손님', 'place-seoul')]);

    // What the device knew after its last push of this trip.
    const known = ['remote-seoul', 'remote-keep'];
    const afterApply = applyTripInspirations(
      [],
      withoutDeletedSavedPlaces([
        place('remote-seoul', '단골손님', 'place-seoul'),
        place('remote-keep', '광장시장', 'place-market'),
      ]),
      korea,
    );

    expect(idsToPrune(known, afterApply.map(entry => entry.id))).toEqual(['remote-seoul']);
  });

  it('matches on the place, not on the row id', () => {
    // The ids disagree by construction — a place saved out of somebody's
    // collection carries the server's id, not the one this phone minted.
    rememberDeletedSavedPlaces([place('local-seoul', '단골손님', 'place-seoul')]);
    expect(withoutDeletedSavedPlaces([place('completely-different-id', '단골손님', 'place-seoul')]))
      .toEqual([]);
  });

  it('keeps a place with no placeId apart by name', () => {
    rememberDeletedSavedPlaces([place('local-a', '다곡소님')]);
    expect(withoutDeletedSavedPlaces([place('remote-a', '다곡소님'), place('remote-b', '단골손님')])
      .map(entry => entry.placeName)).toEqual(['단골손님']);
  });

  it('lifts the refusal when the traveller saves the place again', () => {
    const saved = place('local-seoul', '단골손님', 'place-seoul');
    rememberDeletedSavedPlaces([saved]);
    expect(deletedSavedPlaceKeys()).toHaveLength(1);

    // Held again — by whichever of the four save paths. The list is the fact.
    reconcileDeletedSavedPlaces([saved]);

    expect(deletedSavedPlaceKeys()).toEqual([]);
    expect(withoutDeletedSavedPlaces([place('remote-seoul', '단골손님', 'place-seoul')]))
      .toHaveLength(1);
  });

  it('leaves refusals for places that are not held', () => {
    rememberDeletedSavedPlaces([place('a', '단골손님', 'place-seoul'), place('b', '광장시장', 'place-market')]);
    reconcileDeletedSavedPlaces([place('a', '단골손님', 'place-seoul')]);
    expect(deletedSavedPlaceKeys()).toEqual(['place:place-market']);
  });
});

describe('both delete doors write the refusal down', () => {
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

  /*
    Asserted against the source because the failure is invisible from outside:
    a delete that forgets to record itself still empties the screen, still
    persists, still reports success — and the place returns one sync later,
    which no test of the handler itself can see.
  */
  it('remembers the refusal when a place is removed from the shelf', () => {
    const handler = app.slice(app.indexOf('const removeSavedTravelInspiration ='));
    expect(handler.slice(0, handler.indexOf('};'))).toContain('rememberDeletedSavedPlaces(');
  });

  it('remembers the refusal when places are removed in the planner', () => {
    const handler = app.slice(app.indexOf('const handleRemoveInspirations ='));
    expect(handler.slice(0, handler.indexOf('};'))).toContain('rememberDeletedSavedPlaces(');
  });

  it('filters the server copy before it replaces the shelf', () => {
    const apply = app.slice(app.indexOf('applyTripInspirations('), app.indexOf('if (snapshot.taxRule)'));
    expect(apply).toContain('withoutDeletedSavedPlaces(');
  });
});
