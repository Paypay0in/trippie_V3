import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastExpenseIntakeFailure, parseImageExpenseWithGemini } from './geminiService';

/**
 * 「我剛上傳九張收據 無法解析」.
 *
 * Every failure came back as the same null, so nine photographs refused for
 * being too large, a service still waking up and a genuinely unreadable receipt
 * all produced one sentence — 「請重試」 — which is advice that cannot work for
 * three of those four.
 */

const respondWith = (status: number) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ amount: 1, currency: 'TWD' }),
  })));
};

afterEach(() => vi.unstubAllGlobals());

describe('辨識失敗的原因', () => {
  it('照片太大就說照片太大', async () => {
    respondWith(413);

    await parseImageExpenseWithGemini('abc', 'image/jpeg');

    expect(lastExpenseIntakeFailure()).toContain('太大');
  });

  it('額度用完就說額度，不是叫人重試', async () => {
    respondWith(429);

    await parseImageExpenseWithGemini('abc', 'image/jpeg');

    expect(lastExpenseIntakeFailure()).toContain('上限');
  });

  it('服務還沒醒來是另一回事', async () => {
    respondWith(503);

    await parseImageExpenseWithGemini('abc', 'image/jpeg');

    expect(lastExpenseIntakeFailure()).toContain('暫時無法使用');
  });

  it('斷線就說斷線', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    await parseImageExpenseWithGemini('abc', 'image/jpeg');

    expect(lastExpenseIntakeFailure()).toContain('連線');
  });

  it('讀成功後不留下上一次的錯誤訊息', async () => {
    respondWith(503);
    await parseImageExpenseWithGemini('abc', 'image/jpeg');
    respondWith(200);

    await parseImageExpenseWithGemini('abc', 'image/jpeg');

    expect(lastExpenseIntakeFailure()).toBe('');
  });
});

describe('一張讀太久', () => {
  it('會被放棄，而不是讓整批停在那裡', async () => {
    // No timeout of its own is what left 「第 6/6 張」 on screen indefinitely.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      if (init.signal?.aborted) throw error;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(error));
      });
    }));
    vi.useFakeTimers();

    const read = parseImageExpenseWithGemini('abc', 'image/jpeg');
    await vi.advanceTimersByTimeAsync(95_000);
    const result = await read;
    vi.useRealTimers();

    expect(result).toBeNull();
    expect(lastExpenseIntakeFailure()).toContain('等太久');
  });
});
