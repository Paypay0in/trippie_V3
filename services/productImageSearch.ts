/**
 * A product photograph, from an image search rather than from a model.
 *
 * 「我真心希望看到品名之後可以在網路上抓商品圖」, and the model-with-search
 * route that already exists cannot run: the project's grounding allowance has
 * been exhausted since the morning of 2026-10-21 and does not reset on a
 * calendar day. Asked to choose between raising that quota and wiring a
 * dedicated image search, the Founder chose the second.
 *
 * Google's Custom Search JSON API, in image mode. The reasons it fits better
 * than the model did, beyond the price:
 *
 * - It returns the image's own URL and the page it sits on, as data. The
 *   model had to be asked for them in prose and then audited, because a model
 *   asked for an image URL will cheerfully hand back a search page.
 * - 100 queries a day are free, which is more product pictures than a
 *   traveller looks up in a week.
 *
 * It is not a replacement for grounded search everywhere — prices and place
 * summaries still need that. This is the one job that was only ever 「find a
 * picture of this thing」.
 */

import { looksEditorial } from './merchantPages';

export interface ProductImage {
  /** The image file itself, always https and always an image extension. */
  imageUrl: string;
  /** The page it was found on, so the traveller can see where it came from. */
  pageUrl: string;
}

interface CseItem {
  link?: unknown;
  mime?: unknown;
  image?: { contextLink?: unknown };
}

/**
 * Whether a URL is a picture rather than a page that mentions one.
 *
 * Carried over from the model-based lookup it replaces, where it was the
 * whole of the defence — and tightened, because the regex it used read the
 * whole string: `…/redirect?to=a.jpg` ended in `.jpg` and passed. The
 * extension has to be on the path, where a file name lives, not in a query
 * parameter naming one somewhere else.
 *
 * Still worth having at all: a non-image rendered into an `img` is a broken
 * square on a shelf somebody is trying to shop from.
 */
export const looksLikeAnImage = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /\.(jpe?g|png|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
};

/** What to ask for. The brand first, because that is how a shelf is scanned. */
export const productImageQuery = (name: string, brand?: string): string =>
  [brand?.trim(), name.trim()].filter(Boolean).join(' ');

/**
 * The first result that is actually an image.
 *
 * Not the first result: Custom Search returns what it has, and one entry
 * pointing at a redirector should not cost the other nine.
 */
export const firstUsableImage = (payload: unknown): ProductImage | null => {
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  for (const entry of items as CseItem[]) {
    const link = typeof entry?.link === 'string' ? entry.link.trim() : '';
    if (!looksLikeAnImage(link)) continue;
    const context = typeof entry?.image?.contextLink === 'string' ? entry.image.contextLink.trim() : '';
    return { imageUrl: link, pageUrl: /^https:\/\//.test(context) ? context : '' };
  }
  return null;
};

/**
 * Brave's reply, as much of it as is needed.
 *
 * `properties.url` is the picture itself and `url` is the page it came from.
 * `thumbnail.src` is Brave's own cached copy and is the fallback: it is small,
 * but a small real picture beats none.
 */
interface BraveImageResult {
  url?: unknown;
  properties?: { url?: unknown };
  thumbnail?: { src?: unknown };
}

/*
  A shop's photograph, preferred over a magazine's.

  「這個圖明顯就錯誤」 — 卸妝濕巾 came back wearing a magazine's photograph of
  a hand. A shop's own photograph is the product on white; a magazine's is the
  product being used, in a scene, at an angle chosen to be beautiful. Both
  answer 「show me this thing」 and only one answers it on a shelf.

  Outranked rather than excluded here: an editorial picture beats no picture,
  while an editorial *price* is simply wrong, which is why `looksEditorial`
  lives in its own module and each caller decides what to do with the answer.
*/

const braveEntryToImage = (entry: BraveImageResult): ProductImage | null => {
  const page = typeof entry?.url === 'string' ? entry.url.trim() : '';
  const candidates = [entry?.properties?.url, entry?.thumbnail?.src]
    .map(value => (typeof value === 'string' ? value.trim() : ''));
  const picture = candidates.find(looksLikeAnImage);
  if (!picture) return null;
  return { imageUrl: picture, pageUrl: /^https:\/\//.test(page) ? page : '' };
};

/** A shop's picture if the search returned one, otherwise the first usable. */
export const firstUsableBraveImage = (payload: unknown): ProductImage | null => {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return null;

  const usable = (results as BraveImageResult[])
    .map(braveEntryToImage)
    .filter((found): found is ProductImage => found !== null);

  return usable.find(found => found.pageUrl && !looksEditorial(found.pageUrl))
    ?? usable[0]
    ?? null;
};

export type ImageSearchConfig =
  | { provider: 'brave'; apiKey: string }
  | { provider: 'google'; apiKey: string; engineId: string };

/**
 * Whichever provider this deployment has been given.
 *
 * Brave first because it is the one that was chosen: one key, no search
 * engine to build, and a free allowance larger than Custom Search's. Google
 * stays reachable for a deployment already carrying its two halves — and only
 * both halves: one without the other is not a configuration.
 */
export const imageSearchConfig = (
  env: Record<string, string | undefined> = process.env,
): ImageSearchConfig | null => {
  const brave = env.BRAVE_SEARCH_KEY?.trim();
  if (brave) return { provider: 'brave', apiKey: brave };

  const apiKey = env.GOOGLE_CSE_KEY?.trim();
  const engineId = env.GOOGLE_CSE_CX?.trim();
  return apiKey && engineId ? { provider: 'google', apiKey, engineId } : null;
};

/**
 * Looks one up. Returns null for 「nothing found」, throws for 「could not ask」.
 *
 * The two are different on the screen: 「找不到這個商品的圖片」 is an answer,
 * and a quota or a network failure is not.
 */
export const searchProductImage = async (
  input: { name: string; brand?: string; config: ImageSearchConfig; fetchImpl?: typeof fetch },
): Promise<ProductImage | null> => {
  const query = productImageQuery(input.name, input.brand);
  if (!query) return null;
  const call = input.fetchImpl ?? fetch;

  if (input.config.provider === 'brave') {
    /*
      Verified against the live endpoint on 2026-10-22: it answers 422 naming
      `x-subscription-token` as the missing header, which is a route that
      exists rejecting a request it understood. Today has already cost a
      button that 404'd because a path was assumed, so this one was asked.
    */
    const braveUrl = new URL('https://api.search.brave.com/res/v1/images/search');
    braveUrl.searchParams.set('q', query);
    braveUrl.searchParams.set('count', '10');
    braveUrl.searchParams.set('safesearch', 'strict');

    const braveResponse = await call(braveUrl.toString(), {
      headers: { Accept: 'application/json', 'X-Subscription-Token': input.config.apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!braveResponse.ok) {
      const error = new Error(`image search ${braveResponse.status}`) as Error & { status: number };
      error.status = braveResponse.status;
      throw error;
    }
    return firstUsableBraveImage(await braveResponse.json());
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', input.config.apiKey);
  url.searchParams.set('cx', input.config.engineId);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  // Ten is the maximum per call and costs the same as one, so the filtering
  // above has something to work with.
  url.searchParams.set('num', '10');
  url.searchParams.set('safe', 'active');

  const response = await call(url.toString(), { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    const error = new Error(`image search ${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return firstUsableImage(await response.json());
};
