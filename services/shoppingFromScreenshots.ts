/**
 * Screenshots of things somebody wants to buy, read into shopping list rows.
 *
 * 「上傳截圖 → AI 辨識整理 → 加入購物清單」. A shopping list is built in
 * Instagram saves, 小紅書 posts and chat threads, and the work of moving one
 * into a trip is retyping.
 *
 * Nothing here writes anything. The model reads pictures, this turns what it
 * read into rows, and the traveller ticks the ones that are right — the same
 * rule `ScreenshotItineraryIntake` has always worked to, for the same reason:
 * a picture read wrongly that silently became eight list rows is worse than
 * the feature not existing.
 */
import { ShoppingItem } from '../types';

/** The categories the model is allowed to choose from. See the endpoint. */
const KNOWN_CATEGORIES = ['美妝保養', '服飾', '伴手禮', '食品', '電子', '其他'];

export interface ShoppingCandidate {
  /** Stable within one reading, so a row can be ticked and edited. */
  id: string;
  name: string;
  brand?: string;
  /** Size, colour, how many in a box — whatever the picture said. */
  spec?: string;
  shop?: string;
  category?: string;
  /**
   * The screenshot this row was read out of, as a small data URL.
   *
   * 「要找圖片」 — the only picture of a wanted thing this app can honestly
   * show is the one the traveller uploaded. Everything else on the internet
   * is somebody else's photograph of a product, captioned as their list.
   */
  photo?: string;
}

const text = (value: unknown): string | undefined => {
  const clean = typeof value === 'string' ? value.trim() : '';
  return clean ? clean : undefined;
};

/**
 * What the reading returned, as rows.
 *
 * Anything without a name is dropped rather than shown as a blank row: there
 * is nothing for the traveller to judge, and a tick against nothing writes
 * nothing anybody meant.
 */
export const candidatesFromReading = (
  payload: unknown,
  seed = 'shot',
  photo?: string,
): ShoppingCandidate[] => {
  const products = (payload as { products?: unknown })?.products;
  if (!Array.isArray(products)) return [];
  return products
    .map((entry, index) => {
      const row = entry as Record<string, unknown>;
      const name = text(row.name);
      if (!name) return null;
      const category = text(row.category);
      return {
        id: `${seed}-${index}`,
        name,
        ...(text(row.brand) ? { brand: text(row.brand) } : {}),
        ...(text(row.spec) ? { spec: text(row.spec) } : {}),
        ...(text(row.shop) ? { shop: text(row.shop) } : {}),
        // An unrecognised category is the model inventing one; 其他 is where
        // it belongs rather than a seventh chip nobody chose.
        ...(category ? { category: KNOWN_CATEGORIES.includes(category) ? category : '其他' } : {}),
        ...(photo ? { photo } : {}),
      } as ShoppingCandidate;
    })
    .filter((row): row is ShoppingCandidate => row !== null);
};

/**
 * One reading of one screenshot.
 *
 * The server phrases its own failures — not configured, unreadable, busy —
 * so they are surfaced as written rather than replaced by a generic sentence
 * that hides whether retrying is worth it.
 */
export const readShoppingFromImage = async (input: {
  base64Data: string;
  mimeType?: string;
  seed?: string;
  /** The screenshot itself, downscaled, to hang on every row it produced. */
  photo?: string;
}): Promise<ShoppingCandidate[]> => {
  let response: Response;
  try {
    response = await fetch('/api/shopping/parse-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: input.base64Data, mimeType: input.mimeType }),
    });
  } catch {
    throw new Error('現在無法辨識截圖，請確認連線後再試。');
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '現在無法辨識截圖，請稍後再試。');
  }
  return candidatesFromReading(payload, input.seed, input.photo);
};

/** 「SK-II · 230ml」 — what was read, under the name, as one line. */
export const candidateDetail = (candidate: ShoppingCandidate): string =>
  [candidate.brand, candidate.spec].filter(Boolean).join(' · ');

/**
 * The chosen rows, as shopping list items.
 *
 * `priority` is deliberately absent: nobody said whether these are 必買, and
 * a screenshot is not a statement of urgency. The row can be promoted in the
 * list afterwards, which is where that decision belongs.
 */
export const candidateToShoppingItem = (
  candidate: ShoppingCandidate,
  phase: ShoppingItem['phase'],
  makeId: () => string,
): ShoppingItem => ({
  id: makeId(),
  name: candidate.name,
  isPurchased: false,
  phase,
  ...(candidate.category ? { category: candidate.category } : {}),
  ...(candidate.shop ? { shop: candidate.shop } : {}),
  ...(candidate.photo ? { photo: candidate.photo } : {}),
  /*
    The brand and the size go in the note rather than into the name: the name
    is what gets compared against an existing row, and 「SK-II 青春露 230ml」
    and 「SK-II 青春露」 are the same thing to buy.
  */
  ...(candidateDetail(candidate) ? { description: candidateDetail(candidate) } : {}),
});

/**
 * Adds the chosen rows to a list, without adding one twice.
 *
 * 「自動分類、合併重複商品」. Matched on the name with case and spacing
 * removed — two screenshots of the same bottle are one bottle — and an
 * existing row keeps what it already says rather than being overwritten by a
 * reading somebody has not checked.
 */
/**
 * A product name with nothing in it but the characters.
 *
 * Exported because 「is this the same product」 is asked in two places now —
 * merging two screenshots, and matching a receipt line against the list — and
 * two ideas of that is how a list comes to disagree with itself.
 */
export const shoppingNameKey = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s　]/g, '');

const nameKey = shoppingNameKey;

export const mergeShoppingItems = (
  current: ShoppingItem[],
  incoming: ShoppingItem[],
): { items: ShoppingItem[]; added: number; merged: number } => {
  const next = [...current];
  let added = 0;
  let merged = 0;

  incoming.forEach(item => {
    const existing = next.findIndex(
      saved => saved.phase === item.phase && nameKey(saved.name) === nameKey(item.name),
    );
    if (existing < 0) { next.push(item); added += 1; return; }
    merged += 1;
    // Fills the gaps on the row that is already there; never replaces an
    // answer the traveller may have written themselves.
    next[existing] = {
      ...next[existing],
      category: next[existing].category ?? item.category,
      shop: next[existing].shop ?? item.shop,
      description: next[existing].description ?? item.description,
      photo: next[existing].photo ?? item.photo,
    };
  });

  return { items: next, added, merged };
};
