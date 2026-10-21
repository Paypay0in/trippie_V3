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
