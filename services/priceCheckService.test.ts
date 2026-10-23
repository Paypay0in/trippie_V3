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
import { checkPrices, clearPriceCheckCache, quoteLabel, quotesIn } from './priceCheckService';

const quote = (over: Record<string, unknown> = {}) => ({
  countryCode: 'TW', shop: '屈臣氏', amount: 1200, currency: 'TWD',
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

describe('quotesIn', () => {
  it('puts the cheapest of a country first', () => {
    const found = quotesIn([
      quote({ amount: 1500 }) as never,
      quote({ amount: 980, shop: '蝦皮' }) as never,
    ], 'TW');

    expect(found.map(row => row.amount)).toEqual([980, 1500]);
  });

  /*
    An empty list for a country is the answer the screen prints as 沒查到 —
    「日本價格：台灣價格：這樣條列 沒查到就說沒查到」 — so the country is never
    filtered away here.
  */
  it('answers nothing for a country with nothing in it', () => {
    expect(quotesIn([quote() as never], 'JP')).toEqual([]);
  });
});

describe('quoteLabel', () => {
  /* Never converted: the shop quoted a number in its own money. */
  it('keeps the money the shop quoted', () => {
    expect(quoteLabel(quote({ currency: 'JPY', amount: 5200 }) as never)).toBe('JPY 5,200');
  });
});

/**
 * What was already looked up stays on the device.
 *
 * The cache used to live for the page, so every reopen asked again for
 * sixteen products in two countries — and every server deploy wiped its own
 * cache too, so a day of releases cost a day of lookups at $5 a thousand.
 */
describe('remembering between visits', () => {
  it('asks again for nothing it already knows', async () => {
    await checkPrices({ name: 'SK-II 青春露', destinationCountry: 'JP', homeCountry: 'TW' });
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    /* A fresh page, with only the device's own store to go on. */
    const stored = localStorage.getItem('trippie_price_cache');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toHaveProperty(
      'sk-ii 青春露||jp|tw'.replace('||', '||'),
    );

    await checkPrices({ name: 'SK-II 青春露', destinationCountry: 'JP', homeCountry: 'TW' });
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls)
      .toHaveLength(calls);
  });

  /* 重新查價 is the one thing that ignores it, which is what it is for. */
  it('looks again when somebody asks it to', async () => {
    await checkPrices({ name: '卸妝濕巾' });
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    await checkPrices({ name: '卸妝濕巾', refresh: true });

    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length)
      .toBe(before + 1);
  });

  /* A refusal is not remembered: 「額度用完了」 becomes false. */
  it('does not keep an answer that failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: '額度用完了。' }) })));

    await checkPrices({ name: '雪肌精' });

    expect(JSON.parse(localStorage.getItem('trippie_price_cache') ?? '{}')).not.toHaveProperty('雪肌精|||');
  });

  /* A full device keeps working; it simply looks things up again. */
  it('survives a store it cannot write to', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect((await checkPrices({ name: '東京芭娜娜' })).quotes).toHaveLength(1);
    setItem.mockRestore();
  });
});
