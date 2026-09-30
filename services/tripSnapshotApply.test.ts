import { describe, expect, it } from 'vitest';
import { TripSyncSnapshot } from './tripSync';
import { hasRemoteContent } from './tripSnapshotApply';

const empty: TripSyncSnapshot = { members: [], expenses: [], itinerary: [], flightAnchors: [] };
const some = <K extends keyof TripSyncSnapshot>(key: K): TripSyncSnapshot =>
  ({ ...empty, [key]: [{} as never] });

describe('hasRemoteContent', () => {
  it('applies a snapshot holding only flights', () => {
    // The bug: flightAnchors was missing from this check, so a trip whose
    // cloud copy held only flights had its whole snapshot discarded. The
    // second device showed an empty trip while the rows sat in the database.
    expect(hasRemoteContent(some('flightAnchors'))).toBe(true);
  });

  it('applies a snapshot holding any one thing', () => {
    expect(hasRemoteContent(some('expenses'))).toBe(true);
    expect(hasRemoteContent(some('members'))).toBe(true);
    expect(hasRemoteContent(some('itinerary'))).toBe(true);
  });

  it('skips a genuinely empty one, which would change nothing anyway', () => {
    expect(hasRemoteContent(empty)).toBe(false);
  });

  it('covers every list on the snapshot', () => {
    // A field added to TripSyncSnapshot and forgotten here is silent: the
    // trip simply arrives without it. This fails when that happens.
    const lists = Object.keys(empty) as Array<keyof TripSyncSnapshot>;
    for (const key of lists) {
      expect(hasRemoteContent(some(key))).toBe(true);
    }
  });
});
