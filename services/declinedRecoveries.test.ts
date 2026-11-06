/**
 * @vitest-environment jsdom
 */
/**
 * The blue notice can be answered 「no」, and then it goes away.
 *
 * 「你看這個藍色會一直顯示 / 我希望我可以回應他說 我不要同步 那這個藍色就消失」.
 *
 * The notice itself is right to exist. A trip deleted on this device is never
 * put back by the sign-in merge — 「我已全部都刪掉過了 但又一直出現」 — and a
 * silent refusal is indistinguishable from a trip that is simply gone, so the
 * refusal is stated out loud. But it carried one button, 「取回」, and a
 * question with only one acceptable answer is not a question. It sat on the
 * home screen for good.
 *
 * What this pins is that declining is an **answer**, not a second deletion:
 * the cloud row is untouched, and the two device-local lists stay separate.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DECLINED_RECOVERIES_STORAGE_KEY,
  declinedRecoveryIds,
  forgetDeclinedRecovery,
  rememberDeclinedRecovery,
} from './declinedRecoveries';
import { DELETED_TRIPS_STORAGE_KEY } from './deletedTrips';
import { recoverableTrips } from './recoverableTrips';
import { RemoteTripSummary } from './tripSync';

const cloudTrip = (id: string, name: string): RemoteTripSummary => ({
  id, name, startDate: '2026-09-02', endDate: '2026-10-07',
} as RemoteTripSummary);

describe('declining an offer', () => {
  beforeEach(() => { localStorage.clear(); });

  it('drops the trip from the notice', () => {
    const cloud = [cloudTrip('busan', '釜山五日遊'), cloudTrip('tainan', '台南')];
    const deleted = ['busan', 'tainan'];

    expect(recoverableTrips(cloud, [], deleted).map(trip => trip.id)).toEqual(['busan', 'tainan']);
    expect(recoverableTrips(cloud, [], deleted, ['busan']).map(trip => trip.id)).toEqual(['tainan']);
  });

  it('survives a reload, which is the whole point', () => {
    rememberDeclinedRecovery('busan');
    expect(declinedRecoveryIds()).toEqual(['busan']);
    expect(localStorage.getItem(DECLINED_RECOVERIES_STORAGE_KEY)).toContain('busan');
  });

  it('does not touch the deletion tombstone', () => {
    /*
      Two lists, two questions: 「did I delete this?」 and 「have I already been
      asked?」. Folded into one they could never disagree, and the day they need
      to, somebody's trip is the cost.
    */
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify(['busan']));
    rememberDeclinedRecovery('busan');
    expect(JSON.parse(localStorage.getItem(DELETED_TRIPS_STORAGE_KEY) || '[]')).toEqual(['busan']);
  });

  it('records an id once, however many times it is answered', () => {
    rememberDeclinedRecovery('busan');
    rememberDeclinedRecovery('busan');
    expect(declinedRecoveryIds()).toEqual(['busan']);
  });

  it('clears when the traveller pulls the trip back after all', () => {
    // Otherwise a later deletion of the same trip would be silently un-offered.
    rememberDeclinedRecovery('busan');
    forgetDeclinedRecovery('busan');
    expect(declinedRecoveryIds()).toEqual([]);
  });

  it('ignores a corrupted store rather than throwing on the home screen', () => {
    localStorage.setItem(DECLINED_RECOVERIES_STORAGE_KEY, 'not json');
    expect(declinedRecoveryIds()).toEqual([]);
  });

  it('defaults to offering everything when nothing was declined', () => {
    // The argument is optional so every existing caller keeps its behaviour.
    expect(recoverableTrips([cloudTrip('busan', '釜山')], [], ['busan']).map(trip => trip.id))
      .toEqual(['busan']);
  });
});
