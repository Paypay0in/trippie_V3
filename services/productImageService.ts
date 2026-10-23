/**
 * A picture of a product, found on the web.
 *
 * 「不 我覺得在網路上抓圖也很有幫助」 — asked for after I had refused it, and it
 * is the Founder's call. What survives from the refusal is the part that makes
 * it honest: the page the image sits on travels with it, so a row can say
 * where its picture is from.
 *
 * A product shot nobody can place is believed precisely because it looks like
 * a product shot. One with a page behind it can be recognised as the wrong
 * bottle.
 *
 * Linked, never copied: the row stores a URL, so nothing is republished and a
 * picture that goes away goes away rather than being kept.
 */
export interface ProductImage {
  imageUrl: string;
  /** The page it was found on. Empty when the search could not say. */
  pageUrl: string;
}

const cache = new Map<string, ProductImage | null>();
const pending = new Map<string, Promise<ProductImage | null>>();

/** For tests: the cache lives for the page, which is longer than one case. */
export const clearProductImageCache = () => { cache.clear(); pending.clear(); };

/** The site a picture came from, for the line under it. 「images.muji.com」 */
export const sourceLabel = (pageUrl: string): string => {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const findProductImage = (
  product: { name: string; brand?: string },
): Promise<ProductImage | null> => {
  const key = `${product.name}|${product.brand ?? ''}`.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetch('/api/shopping/product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: product.name, brand: product.brand }),
  })
    .then(async response => {
      /*
        The allowance is not an answer about the product.

        A 429 used to fall into the same empty object as 「nothing found」, so
        an afternoon with no allowance left looked exactly like sixteen
        products nobody sells a picture of — and the button said 「正在找商品
        圖」 sixteen times and then stopped, explaining nothing.
      */
      if (response.status === 429) {
        const refused = new Error('image search quota') as Error & { quota: true };
        refused.quota = true;
        throw refused;
      }
      return response.ok ? await response.json() as Record<string, unknown> : {};
    })
    .then(payload => {
      const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl : '';
      // Nothing found is a real answer and the common one for a local snack.
      if (!imageUrl) return null;
      return { imageUrl, pageUrl: typeof payload.pageUrl === 'string' ? payload.pageUrl : '' };
    })
    /*
      Only the refusal travels. A network fault or a shop that would not
      answer is 「no picture」, which the row already knows how to show; the
      allowance being spent is not about this product at all and has to
      reach somebody who can act on it.

      Neither is cached when it throws: 「額度用完了」 becomes false, and a
      cached refusal would outlive the thing that caused it.
    */
    .catch(error => {
      if ((error as { quota?: boolean })?.quota) {
        pending.delete(key);
        throw error;
      }
      return null;
    })
    .then(found => { cache.set(key, found); pending.delete(key); return found; });

  pending.set(key, request);
  return request;
};
