/**
 * 「我真心希望看到品名之後可以在網路上抓商品圖」.
 *
 * The model-with-search route could not run — the grounding allowance has
 * been exhausted since the morning of 2026-10-21 — so the lookup is a
 * dedicated image search now. What is tested here is mostly refusal: a
 * search result that is not a picture renders as a broken square on a shelf,
 * and 「nothing found」 and 「could not ask」 must not read the same.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  firstUsableBraveImage,
  firstUsableImage,
  imageSearchConfig,
  looksLikeAnImage,
  productImageQuery,
  searchProductImage,
} from './productImageSearch';

describe('what counts as a picture', () => {
  it('accepts an image file over https', () => {
    for (const url of [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/a.JPEG',
      'https://cdn.example.com/a.png?v=2',
      'https://cdn.example.com/a.webp',
    ]) {
      expect(looksLikeAnImage(url), url).toBe(true);
    }
  });

  /* A page that mentions a product is not a photograph of it. */
  it('refuses a page, a redirector and plain http', () => {
    for (const url of [
      'https://example.com/product/123',
      'https://example.com/redirect?to=a.jpg',
      'http://cdn.example.com/a.jpg',
      '',
    ]) {
      expect(looksLikeAnImage(url), url).toBe(false);
    }
  });
});

describe('the query', () => {
  it('leads with the brand, which is how a shelf is read', () => {
    expect(productImageQuery('青春露', 'SK-II')).toBe('SK-II 青春露');
  });

  it('manages without a brand', () => {
    expect(productImageQuery('轉接頭')).toBe('轉接頭');
  });
});

describe('picking a result', () => {
  const page = 'https://shop.example.com/p/1';

  it('takes the first entry that is actually an image, and where it lives', () => {
    const found = firstUsableImage({
      items: [
        { link: 'https://example.com/not-an-image' },
        { link: 'https://cdn.example.com/bottle.jpg', image: { contextLink: page } },
      ],
    });

    expect(found).toEqual({ imageUrl: 'https://cdn.example.com/bottle.jpg', pageUrl: page });
  });

  /* One bad entry must not cost the other nine. */
  it('skips past unusable entries rather than giving up', () => {
    expect(firstUsableImage({ items: [{ link: 'https://x/redirect' }] })).toBeNull();
  });

  it('is null for a reply with nothing in it', () => {
    expect(firstUsableImage({})).toBeNull();
    expect(firstUsableImage({ items: [] })).toBeNull();
  });

  /* No source page is not a reason to drop the picture. */
  it('keeps an image whose page is missing', () => {
    expect(firstUsableImage({ items: [{ link: 'https://cdn.example.com/a.png' }] }))
      .toEqual({ imageUrl: 'https://cdn.example.com/a.png', pageUrl: '' });
  });
});

describe('configuration', () => {
  /* Half a configuration is not a configuration. */
  it('needs both halves for Google', () => {
    expect(imageSearchConfig({ GOOGLE_CSE_KEY: 'k' })).toBeNull();
    expect(imageSearchConfig({ GOOGLE_CSE_CX: 'c' })).toBeNull();
    expect(imageSearchConfig({})).toBeNull();
    expect(imageSearchConfig({ GOOGLE_CSE_KEY: 'k', GOOGLE_CSE_CX: 'c' }))
      .toEqual({ provider: 'google', apiKey: 'k', engineId: 'c' });
  });

  /* Brave needs one key, which is the whole reason it was chosen. */
  it('takes Brave from a single key', () => {
    expect(imageSearchConfig({ BRAVE_SEARCH_KEY: 'b' }))
      .toEqual({ provider: 'brave', apiKey: 'b' });
  });

  it('prefers Brave when a deployment carries both', () => {
    expect(imageSearchConfig({ BRAVE_SEARCH_KEY: 'b', GOOGLE_CSE_KEY: 'k', GOOGLE_CSE_CX: 'c' }))
      .toEqual({ provider: 'brave', apiKey: 'b' });
  });
});

/**
 * Brave's reply.
 *
 * The endpoint was asked on 2026-10-22 rather than assumed: it answers 422
 * naming `x-subscription-token`, which is a route that exists refusing a
 * request it understood. A button that 404s cost a traveller's trust earlier
 * the same night because a path was guessed.
 */
describe('reading what Brave sends back', () => {
  const brave = { provider: 'brave', apiKey: 'b' } as const;

  it('takes the full picture and the page it came from', () => {
    expect(firstUsableBraveImage({
      results: [{
        url: 'https://shop.example.com/p/1',
        properties: { url: 'https://cdn.example.com/bottle.jpg' },
        thumbnail: { src: 'https://imgs.brave.com/small.jpg' },
      }],
    })).toEqual({
      imageUrl: 'https://cdn.example.com/bottle.jpg',
      pageUrl: 'https://shop.example.com/p/1',
    });
  });

  /* A small real picture beats none. */
  it('falls back to the thumbnail when the full one is unusable', () => {
    expect(firstUsableBraveImage({
      results: [{
        url: 'https://shop.example.com/p/1',
        properties: { url: 'https://example.com/not-an-image' },
        thumbnail: { src: 'https://imgs.brave.com/small.jpg' },
      }],
    })?.imageUrl).toBe('https://imgs.brave.com/small.jpg');
  });

  /*
    A shape this does not recognise reads as 「nothing found」 rather than
    breaking. The reply was never seen with a real key, so it has to fail
    softly.
  */
  it('is null for a reply it does not understand', () => {
    expect(firstUsableBraveImage({})).toBeNull();
    expect(firstUsableBraveImage({ results: [] })).toBeNull();
    expect(firstUsableBraveImage({ results: [{ url: 'https://x/p' }] })).toBeNull();
  });

  it('sends the key as the header the endpoint asked for', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, json: async () => ({ results: [] }),
    })) as unknown as typeof fetch;

    await searchProductImage({ name: '青春露', brand: 'SK-II', config: brave, fetchImpl });

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain('api.search.brave.com/res/v1/images/search');
    expect(new URL(url).searchParams.get('q')).toBe('SK-II 青春露');
    expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('b');
  });
});

describe('the search itself', () => {
  const config = { provider: 'google', apiKey: 'k', engineId: 'c' } as const;

  it('asks for images, safely, ten at a time', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ items: [{ link: 'https://cdn.example.com/a.jpg' }] }),
    })) as unknown as typeof fetch;

    await searchProductImage({ name: '青春露', brand: 'SK-II', config, fetchImpl });

    const asked = new URL((fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(asked.searchParams.get('searchType')).toBe('image');
    expect(asked.searchParams.get('q')).toBe('SK-II 青春露');
    expect(asked.searchParams.get('safe')).toBe('active');
    expect(asked.searchParams.get('num')).toBe('10');
  });

  /*
    「nothing found」 and 「could not ask」 are different on the screen, so they
    are different here: one is a value, the other is thrown.
  */
  it('returns nothing for an empty result', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })) as unknown as typeof fetch;

    expect(await searchProductImage({ name: '轉接頭', config, fetchImpl })).toBeNull();
  });

  it('throws when the search could not be made, carrying the status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(searchProductImage({ name: '轉接頭', config, fetchImpl }))
      .rejects.toMatchObject({ status: 429 });
  });

  it('asks nothing at all for an empty product', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    expect(await searchProductImage({ name: '   ', config, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
