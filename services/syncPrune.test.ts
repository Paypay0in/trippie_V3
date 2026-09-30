/**
 * The rule that decides whether the other person's expense survives.
 *
 * Reported from the trip itself: 「他記帳我的有出現，但我記帳她的沒出現」.
 * The asymmetry was the read happening once; the danger underneath it was the
 * push deleting rows it had never seen.
 */
import { describe, expect, it } from 'vitest';
import { idsToPrune, nextKnownIds } from './syncPrune';

describe('idsToPrune', () => {
  it('never deletes an expense this device has not seen', () => {
    // The whole point. B pushes while holding a list that predates A's
    // expense; under the old rule "delete everything not in my list", A's
    // expense was removed from the server by B saving their own.
    expect(idsToPrune(['b-1'], ['b-1', 'b-2'])).toEqual([]);
  });

  it('deletes what this device had and removed', () => {
    // Deletion still has to travel, or a charge someone cancelled comes back
    // on the next person to open the trip.
    expect(idsToPrune(['a-1', 'a-2'], ['a-1'])).toEqual(['a-2']);
  });

  it('deletes nothing when this device knows of nothing yet', () => {
    // A device that has not completed a read knows nothing, so it may not
    // delete anything — which is exactly the state a freshly opened phone is
    // in, and the state in which it used to be most destructive.
    expect(idsToPrune([], ['a-1', 'a-2'])).toEqual([]);
  });

  it('deletes everything when the ledger was emptied on purpose', () => {
    expect(idsToPrune(['a-1', 'a-2'], [])).toEqual(['a-1', 'a-2']);
  });
});

describe('nextKnownIds', () => {
  it('adopts what was just written', () => {
    expect(nextKnownIds(['a-1'], ['a-1', 'a-2'])).toEqual(new Set(['a-1', 'a-2']));
  });

  it('forgets what was deleted, so a later push cannot delete it twice', () => {
    // If a deleted id stayed known, someone else recreating a row under that
    // id would have it destroyed by this device's next push.
    expect(nextKnownIds(['a-1', 'a-2'], ['a-1'])).toEqual(new Set(['a-1']));
  });
});
