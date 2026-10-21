/**
 * @vitest-environment jsdom
 *
 * 「我剛剛在記帳的介面上要加入圖片 結果不能儲存 會變成全白」.
 *
 * Receipt photos live inside the draft as base64, so a handful of them fills
 * the device. The write runs inside an effect, which means the
 * `QuotaExceededError` was thrown during React's commit and unmounted the
 * whole tree — a white screen, the unsaved bill gone with it, and nothing on
 * screen to say why.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeDraftStore, DRAFTS_STORAGE_KEY } from './tripPersistence';
import { saveEverSeen } from './everSeenRemoteIds';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const draft = { id: 'd1', name: '東京' } as never;

const full = (error: unknown) => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw error; });
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

describe('writing the drafts when the device is full', () => {
  it('does not throw', () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    full(quota);

    expect(() => writeDraftStore([draft], 'd1')).not.toThrow();
  });

  /* The caller has to be able to tell the traveller which problem this is. */
  it('says the device is full', () => {
    full(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));

    expect(writeDraftStore([draft], 'd1')).toEqual({ saved: false, reason: 'quota' });
  });

  /* Safari in private mode throws a plain error carrying code 22. */
  it('recognises the private-mode shape too', () => {
    full(Object.assign(new Error('nope'), { code: 22 }));

    expect(writeDraftStore([draft], 'd1')).toEqual({ saved: false, reason: 'quota' });
  });

  /* Anything else is still a failure, and still reported as one. */
  it('reports an unrecognised failure rather than claiming success', () => {
    full(new Error('something else'));

    expect(writeDraftStore([draft], 'd1')).toEqual({ saved: false, reason: 'unknown' });
  });

  it('says so plainly when it worked', () => {
    expect(writeDraftStore([draft], 'd1')).toEqual({ saved: true });
    expect(localStorage.getItem(DRAFTS_STORAGE_KEY)).toContain('東京');
  });
});

/**
 * 「行程儲存失敗…這台裝置的儲存空間可能滿了」.
 *
 * A full device used to stop everything: a stop added to tomorrow could not be
 * saved because of a receipt photographed last week. The photos are on the
 * server for any trip that has synced, so the local copy is a cache — and a
 * cache is the right thing to drop when the shelf is full.
 */
describe('a full device with photos the cloud already holds', () => {
  const quota = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

  const withPhotos = [{
    id: 'trip-1', name: '東京',
    expenses: [{ id: 'e1', description: '黑船亭', receiptPhotos: ['a', 'b'] }],
  }] as never;

  it('frees them and saves', () => {
    saveEverSeen('trip-1', { expenses: ['e1'] });
    let attempt = 0;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      attempt += 1;
      // The first write is the one with the photos in it.
      if (attempt === 1) throw quota();
      real.call(this, key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(writeDraftStore(withPhotos, 'trip-1')).toEqual({ saved: true, lightened: 2 });
  });

  /* Nothing confirmed means nothing safe to drop, so it still reports. */
  it('still fails when there is nothing safe to free', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quota(); });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(writeDraftStore(withPhotos, 'trip-1')).toEqual({ saved: false, reason: 'quota' });
  });
});
