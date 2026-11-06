/**
 * 「這個東西我已經刪掉兩次了 / 他又跑出來」 — a saved place, removed twice, back twice.
 *
 * The same sentence is already quoted twice in this codebase, at two earlier
 * doors: `useTripSync` says 「這也刪掉過了又出現」 about merging being unable to
 * express a deletion, and `tripSync` says 「一直出現」 about the prune being
 * skipped when no row had changed. Both were fixed. This is the third door.
 *
 * The push aligns a row's id to the server's before writing it —
 * `alignInspirationRowIds`, because two phones mint different ids for one
 * restaurant and inserting a second id for a place the place-index already
 * holds fails the whole batch. So after a push, the server's row for that place
 * carries the REMOTE id.
 *
 * But what the device records as 「known」 afterwards is the LOCAL id
 * (`useTripSync`: `s.map(entry => entry.id)`), and the prune deletes
 * `.in('id', idsToPrune(known, current))`. For any place whose id was aligned,
 * those two id spaces disagree, so the delete names a row that does not exist,
 * removes nothing, and the next read brings the place back.
 *
 * Which places get aligned? Exactly the ones that arrived from somewhere else —
 * saved off another traveller's collection, or recognised from a screenshot.
 * The two in the Founder's screenshot are both 「全部來自 Ann」.
 *
 * The failure is silent by construction: the delete reports success, because
 * deleting zero rows is not an error.
 */
import { describe, expect, it } from 'vitest';
import { alignInspirationRowIds, toTripInspirationRow } from './tripSyncMapping';
import { idsToPrune } from './syncPrune';
import { knownInspirationIds } from './knownInspirationIds';
import { withFingerprints } from './rowFingerprints';
import { SavedTravelInspiration } from '../types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const place = (id: string, placeName: string): SavedTravelInspiration => ({
  id,
  savedByUserId: 'me',
  placeName,
  country: '韓國',
  city: '首爾',
  notes: [],
  savedAt: '2026-11-01T00:00:00.000Z',
} as SavedTravelInspiration);

describe('deleting a place that arrived from somebody else', () => {
  /** What the push does: align to the server's ids, then record fingerprints. */
  const pushOnce = (local: SavedTravelInspiration[], serverRows: { id: string; place_id?: string; place_name?: string }[]) => {
    const aligned = alignInspirationRowIds(
      local.map(entry => toTripInspirationRow(entry, 'trip-1')),
      serverRows as never,
    );
    return { aligned, fingerprints: withFingerprints(undefined, 'trip_inspirations', aligned) };
  };

  it('prunes the id the server actually holds, not the one this phone minted', () => {
    const local = [place('local-abc', '天丼てんや')];
    // The server already has this place under its own id, from the collection
    // it was saved out of.
    const server = [{ id: 'remote-xyz', place_id: null, place_name: '天丼てんや' }];

    const { aligned, fingerprints } = pushOnce(local, server);
    expect(aligned[0].id).toBe('remote-xyz');

    // What the device must remember is what the server now holds.
    const known = knownInspirationIds(fingerprints, local.map(entry => entry.id));
    expect(known).toEqual(['remote-xyz']);

    // The traveller deletes it. The prune has to name the server's row.
    expect(idsToPrune(known, [])).toEqual(['remote-xyz']);
  });

  it('falls back to this phone ids when the push said nothing', () => {
    // A failed or skipped push leaves no fingerprints for the table. Reading
    // that as 「the server holds nothing」 would let the next prune delete
    // everything, so the local ids stand — the state this device was in before.
    expect(knownInspirationIds(undefined, ['local-1', 'local-2'])).toEqual(['local-1', 'local-2']);
    expect(knownInspirationIds({}, ['local-1'])).toEqual(['local-1']);
  });

  it('reads only its own table out of the fingerprints', () => {
    const mixed = {
      'trip_inspirations:remote-1': '{}',
      'expenses:e-1': '{}',
      'itinerary_items:i-1': '{}',
    };
    expect(knownInspirationIds(mixed, ['local-1'])).toEqual(['remote-1']);
  });

  it('keeps ids this phone minted that the server never renamed', () => {
    const local = [place('local-abc', '天丼てんや'), place('local-def', 'Ikoi.ハナレ')];
    // Only the first place exists on the server already.
    const { fingerprints } = pushOnce(local, [{ id: 'remote-xyz', place_id: null, place_name: '天丼てんや' }]);
    const known = knownInspirationIds(fingerprints, local.map(entry => entry.id));
    expect(known.sort()).toEqual(['local-def', 'remote-xyz']);

    // Deleting the second one must still name its own id.
    expect(idsToPrune(known, ['remote-xyz'])).toEqual(['local-def']);
  });
});

describe('re-pointing a place at a different one', () => {
  /*
    「這幾個我已經重新訂位到釜山過了」 — rebound, and still showing the Seoul
    binding after a reload.

    Alignment is keyed on the place, not on the row id (`inspirationRowKey`:
    `place:<place_id>`). Re-pointing a save changes that key, so the server's
    existing row — written under a remote id when the place was still the old
    one — stops matching and is left behind. The rebound record goes up under
    this phone's own id, and the orphan comes back on the next read as the
    binding the traveller just replaced.

    Recording the aligned ids is what lets the orphan be pruned: it was known,
    it is no longer in the list, so it goes. Recording local ids left known and
    current identical, so nothing was ever deleted.
  */
  it('prunes the row the old binding left behind', () => {
    const remoteIdBeforeRebind = 'remote-seoul';
    const localIdAfterRebind = 'local-busan';

    // What the device knew after the last push, under the old binding.
    const known = knownInspirationIds(
      { 'trip_inspirations:remote-seoul': '{}' },
      ['local-seoul'],
    );
    expect(known).toEqual([remoteIdBeforeRebind]);

    // After re-pointing, the outgoing row no longer matches the server's key,
    // so it keeps this phone's id.
    expect(idsToPrune(known, [localIdAfterRebind])).toEqual([remoteIdBeforeRebind]);
  });

  it('would have pruned nothing had local ids been recorded', () => {
    // The state production was in: known and current agree, so the stale row
    // survives and reappears. This is the regression, written down.
    expect(idsToPrune(['local-seoul'], ['local-seoul'])).toEqual([]);
  });
});

describe('the hook records what the server holds', () => {
  const hook = readFileSync(join(process.cwd(), 'hooks/useTripSync.ts'), 'utf8');

  it('derives known saved-place ids from the push, not from local state', () => {
    /*
      Asserted against the source because the failure is invisible from
      outside: the prune names a row that does not exist, the delete succeeds
      on zero rows, and the only symptom arrives one read later as a place the
      traveller already removed. Nothing throws, so nothing else can catch a
      revert to `s.map(entry => entry.id)` here.
    */
    const known = hook.slice(hook.indexOf('inspirations: nextKnownIds('), hook.indexOf('shoppingList: nextKnownIds('));
    expect(known).toContain('knownInspirationIds(');
    expect(known).toContain("result.status === 'ok' ? result.data?.fingerprints : undefined");
  });
});
