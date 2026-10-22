/**
 * @vitest-environment jsdom
 *
 * 「也要幫忙比價 台灣屈臣氏啊 蝦皮價格 / 日本松本清…」.
 *
 * Every quote carries the page it was read from. §6 of `docs/PRODUCT.md`:
 * a figure nobody looked up is 價格需確認, and a remembered one looks
 * identical on screen to a checked one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byRegion, checkPrices, clearPriceCheckCache, quoteLabel } from './priceCheckService';

const quote = (over: Record<string, unknown> = {}) => ({
  region: '台灣', shop: '屈臣氏', amount: 1200, currency: 'TWD',
  sourceUrl: 'https://www.watsons.com.tw/p/1', ...over,
});

const answer = vi.fn(async () => ({ quotes: [quote()], readAt: '2026-10-21T00:00:00.000Z' }));

beforeEach(() => {
  clearPriceCheckCache();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => await answer() })));
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('checkPrices', () => {
  it('keeps a quote that has a page behind it', async () => {
    const { quotes } = await checkPrices({ name: 'SK-II 青春露' });

    expect(quotes).toHaveLength(1);
    expect(quotes[0].sourceUrl).toContain('watsons');
  });

  /* A quote nobody can check is a remembered price in the same clothes. */
  it('drops a quote with no source', async () => {
    answer.mockResolvedValueOnce({ quotes: [quote({ sourceUrl: '' })], readAt: '' });

    expect((await checkPrices({ name: 'x' })).quotes).toEqual([]);
  });

  it('says when it was read', async () => {
    expect((await checkPrices({ name: 'SK-II 青春露' })).readAt).toBe('2026-10-21T00:00:00.000Z');
  });

  /* One search per product, not one per render. */
  it('asks once for the same product', async () => {
    await checkPrices({ name: 'SK-II' });
    await checkPrices({ name: 'sk-ii' });

    expect(answer).toHaveBeenCalledTimes(1);
  });

  /*
    「價格一定找得到 別騙我」 — and he was right: the lookup was saying 查不到
    這個商品的售價 while the real failure was the search allowance being
    spent. One says stop looking, the other says try tomorrow.
  */
  it('keeps the server\'s reason rather than blaming the product', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: '網路查詢的額度用完了，要在 Google AI Studio 提高才會恢復。' }),
    })));

    expect((await checkPrices({ name: 'x' })).error).toContain('額度用完');
  });

  /* 「today」 stops being true tomorrow, so a refusal is not cached. */
  it('does not cache a failure', async () => {
    const failing = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'nope' }) }));
    vi.stubGlobal('fetch', failing);

    await checkPrices({ name: 'x' });
    await checkPrices({ name: 'x' });

    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('survives the lookup failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    expect((await checkPrices({ name: 'x' })).quotes).toEqual([]);
  });
});

describe('byRegion', () => {
  it('puts the cheapest of each region first', () => {
    const grouped = byRegion([
      quote({ amount: 1500 }) as never,
      quote({ amount: 980, shop: '蝦皮' }) as never,
    ]);

    expect(grouped[0][1].map(row => row.amount)).toEqual([980, 1500]);
  });

  it('leaves out a region with nothing in it', () => {
    expect(byRegion([quote() as never]).map(([region]) => region)).toEqual(['台灣']);
  });
});

describe('quoteLabel', () => {
  /* Never converted: the shop quoted a number in its own money. */
  it('keeps the money the shop quoted', () => {
    expect(quoteLabel(quote({ currency: 'JPY', amount: 5200 }) as never)).toBe('JPY 5,200');
  });
});
