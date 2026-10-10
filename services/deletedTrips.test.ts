/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DELETED_TRIPS_STORAGE_KEY,
  deletedTripIds,
  forgetDeletedTrip,
  isTripDeleted,
  rememberDeletedTrip,
  withoutDeleted,
} from './deletedTrips';

/**
 * 「我已全部都刪掉過了 但又一直出現」.
 *
 * Deleting rewrote the local store and told the cloud nothing. The merge that
 * runs on every sign-in asks the server for every trip on the account and adds
 * whatever this device does not have — which is the exact description of a
 * trip that was just deleted.
 */
beforeEach(() => localStorage.clear());

const trip = (id: string) => ({ id, name: id });

describe('記住被刪掉的旅程', () => {
  it('刪過的就記下來', () => {
    rememberDeletedTrip('t1');
    expect(isTripDeleted('t1')).toBe(true);
  });

  it('沒刪過的不算', () => {
    rememberDeletedTrip('t1');
    expect(isTripDeleted('t2')).toBe(false);
  });

  it('刪兩次也只記一筆', () => {
    rememberDeletedTrip('t1');
    rememberDeletedTrip('t1');
    expect(deletedTripIds()).toEqual(['t1']);
  });

  it('空的 id 不會被記成一筆', () => {
    rememberDeletedTrip('');
    expect(deletedTripIds()).toEqual([]);
  });

  it('重開 app 以後還記得', () => {
    rememberDeletedTrip('t1');
    // What survives a reload is the store, so that is what is read back.
    expect(JSON.parse(localStorage.getItem(DELETED_TRIPS_STORAGE_KEY) || '[]'))
      .toEqual(['t1']);
  });

  it('存壞掉的資料不會讓整個功能爆掉', () => {
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, '{not json');
    expect(deletedTripIds()).toEqual([]);
  });
});

describe('雲端回來的清單要先過濾', () => {
  it('刪掉的那一趟不會再被加回來', () => {
    rememberDeletedTrip('tokyo');
    const fromCloud = [trip('tokyo'), trip('busan')];

    expect(withoutDeleted(fromCloud).map(t => t.id)).toEqual(['busan']);
  });

  it('沒刪過任何東西時，原封不動', () => {
    const fromCloud = [trip('tokyo'), trip('busan')];
    expect(withoutDeleted(fromCloud)).toBe(fromCloud);
  });

  it('全部刪光就全部擋掉', () => {
    rememberDeletedTrip('tokyo');
    rememberDeletedTrip('busan');
    expect(withoutDeleted([trip('tokyo'), trip('busan')])).toEqual([]);
  });
});

/**
 * Joining the same trip again by invite is somebody asking for it back in as
 * many words, and must outrank a refusal recorded earlier.
 */
describe('重新加入就是要回來', () => {
  it('重新加入會清掉那個記號', () => {
    rememberDeletedTrip('tokyo');
    forgetDeletedTrip('tokyo');

    expect(isTripDeleted('tokyo')).toBe(false);
    expect(withoutDeleted([trip('tokyo')]).map(t => t.id)).toEqual(['tokyo']);
  });

  it('清掉一個不會動到其他的', () => {
    rememberDeletedTrip('tokyo');
    rememberDeletedTrip('busan');
    forgetDeletedTrip('tokyo');

    expect(deletedTripIds()).toEqual(['busan']);
  });

  it('清一個沒記過的不會出事', () => {
    expect(() => forgetDeletedTrip('never-seen')).not.toThrow();
  });
});
