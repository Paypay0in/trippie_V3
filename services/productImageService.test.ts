/**
 * @vitest-environment jsdom
 *
 * 「不 我覺得在網路上抓圖也很有幫助」.
 *
 * Linked, never copied, and never without the page it came from: a product
 * shot nobody can place is believed precisely because it looks like a product
 * shot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProductImageCache, findProductImage, sourceLabel } from './productImageService';

const answer = vi.fn(async () => ({ imageUrl: 'https://images.example.com/a.jpg', pageUrl: 'https://www.example.com/p/1' }));

beforeEach(() => {
  clearProductImageCache();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => await answer() })));
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('findProductImage', () => {
  it('returns the picture and where it came from', async () => {
    expect(await findProductImage({ name: 'SK-II 青春露' })).toEqual({
      imageUrl: 'https://images.example.com/a.jpg',
      pageUrl: 'https://www.example.com/p/1',
    });
  });

  /* Nothing found is a real answer, and the common one for a local snack. */
  it('says nothing rather than something', async () => {
    answer.mockResolvedValueOnce({ imageUrl: '', pageUrl: '' });

    expect(await findProductImage({ name: '謎之點心' })).toBeNull();
  });

  /* One search per product, not one per render. */
  it('asks once for the same product', async () => {
    await findProductImage({ name: 'SK-II 青春露' });
    await findProductImage({ name: 'sk-ii 青春露' });

    expect(answer).toHaveBeenCalledTimes(1);
  });

  it('survives the lookup failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    expect(await findProductImage({ name: 'x' })).toBeNull();
  });
});

describe('sourceLabel', () => {
  it('names the site', () => {
    expect(sourceLabel('https://www.muji.com/jp/item/1')).toBe('muji.com');
  });

  it('is empty for something that is not a page', () => {
    expect(sourceLabel('not a url')).toBe('');
  });
});

/**
 * The allowance is not an answer about the product.
 *
 * A 429 used to fall into the same empty object as 「nothing found」, so an
 * afternoon with no allowance left looked exactly like sixteen products
 * nobody sells a picture of.
 */
describe('when the picture search will not answer', () => {
  it('passes the refusal to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));

    await expect(findProductImage({ name: 'x' })).rejects.toMatchObject({ quota: true });
  });

  /* And does not remember it: the allowance comes back. */
  it('does not cache the refusal', async () => {
    const call = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    vi.stubGlobal('fetch', call);
    await findProductImage({ name: 'y' }).catch(() => undefined);

    await findProductImage({ name: 'y' }).catch(() => undefined);

    expect(call).toHaveBeenCalledTimes(2);
  });

  /* A shop that would not answer is still just 「no picture」. */
  it('keeps an ordinary failure quiet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));

    expect(await findProductImage({ name: 'z' })).toBeNull();
  });
});
