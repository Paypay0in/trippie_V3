import { describe, expect, it } from 'vitest';
import { tripDeletionReach } from './tripDeletionReach';

/**
 * 「這個我已經刪除了」 — about three trips that had been deleted and had come
 * back.
 *
 * The tombstone added earlier stops them returning to this device, and that is
 * the right answer for exactly one case: a trip somebody else is also on.
 * Everywhere else it means the delete did not happen — the row lives, and the
 * laptop offers it back at the next sign-in.
 */
const ME = 'user-me';
const GINA = 'user-gina';

describe('刪除要刪到哪裡', () => {
  it('我的、沒有別人在上面 → 真的刪掉', () => {
    expect(tripDeletionReach({ ownerId: ME, companions: [] }, ME)).toBe('cloud');
  });

  /**
   * The thing this rule exists to prevent: 「remove this from my phone」
   * destroying the ledger a travelling companion is still settling from.
   */
  it('我的、但有旅伴 → 只從這台裝置拿掉', () => {
    expect(tripDeletionReach({ ownerId: ME, companions: [{ id: GINA }] }, ME)).toBe('device');
  });

  it('別人的旅程 → 我只能離開，不能銷毀', () => {
    expect(tripDeletionReach({ ownerId: GINA, companions: [] }, ME)).toBe('device');
  });

  it('沒有主人的本機草稿 → 沒有列可以刪', () => {
    expect(tripDeletionReach({ companions: [] }, ME)).toBe('device');
  });

  it('沒登入 → 本機清單就是全部', () => {
    expect(tripDeletionReach({ ownerId: ME, companions: [] }, undefined)).toBe('device');
  });

  it('雲端沒接上 → 不要假裝刪得掉', () => {
    expect(tripDeletionReach({ ownerId: ME, companions: [] }, ME, { syncAvailable: false }))
      .toBe('device');
  });

  it('companions 沒填等同沒有旅伴', () => {
    expect(tripDeletionReach({ ownerId: ME }, ME)).toBe('cloud');
  });
});
