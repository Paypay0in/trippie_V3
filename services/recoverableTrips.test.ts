/**
 * 「不見了」 — the trip the cloud still has and this device will not show.
 *
 * The line being drawn is between two refusals that look the same: a trip the
 * merge is about to add anyway, and a trip the merge will never add because
 * somebody deleted it here. Only the second one needs a button.
 */
import { describe, expect, it } from 'vitest';
import { recoverableDates, recoverableTrips } from './recoverableTrips';
import { RemoteTripSummary } from './tripSync';

const cloudTrip = (id: string, name: string, over: Partial<RemoteTripSummary> = {}): RemoteTripSummary => ({
  id, name, startDate: '2026-10-02', endDate: '2026-10-06', ...over,
});

describe('recoverableTrips', () => {
  const busan = cloudTrip('busan', '釜山');
  const tokyo = cloudTrip('tokyo', '東京');

  it('names the trip the cloud kept and this device deleted', () => {
    const found = recoverableTrips([busan, tokyo], ['tokyo'], ['busan']);

    expect(found.map(trip => trip.name)).toEqual(['釜山']);
  });

  /*
    A trip the merge is about to add is not a trip anybody has to recover.
    Offering a button for it would ask the traveller to fix something that
    fixes itself a second later.
  */
  it('says nothing about a trip that is merely absent', () => {
    expect(recoverableTrips([busan, tokyo], ['tokyo'], [])).toEqual([]);
  });

  /* Deleted here and already back: nothing to offer. */
  it('says nothing about a deleted trip that is on the device anyway', () => {
    expect(recoverableTrips([busan], ['busan'], ['busan'])).toEqual([]);
  });

  /*
    The deletion stands until somebody asks. This reports; it does not undo —
    「我已全部都刪掉過了 但又一直出現」 is the bug on the other side of this
    line, and it is the worse one.
  */
  it('never reports a trip the cloud no longer has', () => {
    expect(recoverableTrips([tokyo], ['tokyo'], ['busan'])).toEqual([]);
  });

  it('carries the owner through, because whose trip it is cannot be guessed', () => {
    const [found] = recoverableTrips([cloudTrip('busan', '釜山', { ownerId: 'north' })], [], ['busan']);

    expect(found.ownerId).toBe('north');
  });
});

describe('recoverableDates', () => {
  it('prints the range when the server has both ends', () => {
    expect(recoverableDates({ id: 'b', name: '釜山', startDate: '2026-10-02', endDate: '2026-10-06' }))
      .toBe('2026-10-02 – 2026-10-06');
  });

  /* No dates is a blank, not a pair of dashes that reads as loading. */
  it('prints nothing when the server has neither', () => {
    expect(recoverableDates({ id: 'b', name: '釜山', startDate: '', endDate: '' })).toBe('');
  });
});
