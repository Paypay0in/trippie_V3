/**
 * Whether the thing a page is selling is the thing on the list.
 *
 * This question had never been asked. The pipeline went 「is it a shop」 →
 * 「what does it cost」 with nothing in between, so 米糠发酵修护舒缓湿敷面膜 was
 * quoted NT$490 from a page titled 米糠發酵導入美容液, and roomie.tw's article
 * handed over 乳木果油霜's NT$389 for a lip oil. The right shop, a real price,
 * the wrong product — and every check downstream passed, because all any of
 * them received was a number.
 *
 * Deliberately not a model. A model asked 「is this the same product」 answers
 * yes far more often than it should, and an answer nobody can check is the
 * thing this module exists to prevent. These are rules a person can read and
 * disagree with:
 *
 * - a size that both names state and disagree on is a different product,
 *   whatever else matches — 45ml is not 60ml;
 * - a brand both names state and disagree on is a different product;
 * - otherwise the names must genuinely overlap, and how much they overlap is
 *   the difference between 「this is it」 and 「this might be it」.
 *
 * What it cannot do is know that 面膜 and 美容液 are different *kinds* of
 * thing. It does not need to: they share almost no characters, so the overlap
 * rule rejects them for the ordinary reason.
 */

import { splitNouns } from './productNouns';

export type MatchConfidence = 'exact' | 'probable' | 'none';

export interface Match {
  confidence: MatchConfidence;
  /** Why, in words, for the screen and for a person reading a test failure. */
  reason: string;
}

/** Full-width forms and punctuation, flattened so two spellings can be compared. */
const normalise = (text: string): string =>
  (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[【】\[\]（）()《》〈〉「」『』,，.。、·・/／|｜~〜\-－—_+＋:：;；!！?？"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Latin words of two letters or more; CJK is handled separately. */
const latinWords = (text: string): string[] =>
  (normalise(text).match(/[a-z][a-z0-9]{1,}/g) ?? []);

/** Every CJK character, which is the unit of meaning those names are built from. */
const cjkChars = (text: string): string[] =>
  [...normalise(text)].filter(char => /[぀-ヿ一-鿿]/.test(char));

/**
 * A size the name states: 「50ml」, 「30g」, 「12枚」, 「12片裝」, 「256gb」.
 *
 * Only the ones written with a unit. A bare number in a product name is a
 * model, a year or a count of colours far more often than it is a size.
 */
const SIZE = /(\d+(?:\.\d+)?)\s*(ml|l|g|kg|mg|oz|枚|片|包|入|錠|粒|個|本|gb|tb|吋|inch|cm|mm)(?![a-z0-9])/gi;

export const sizesIn = (text: string): string[] => {
  const found = new Set<string>();
  for (const match of normalise(text).matchAll(SIZE)) {
    const unit = match[2].toLowerCase();
    // 枚/片/包/入 all count sheets or pieces; a 12枚 and a 12片 are the same box.
    const family = /枚|片|包|入|個|本|錠|粒/.test(unit) ? 'count' : unit;
    found.add(`${Number(match[1])}${family}`);
  }
  return [...found];
};

/**
 * How much of the shorter name the two have in common, 0 to 1.
 *
 * Before anything is counted, the category nouns both names contain are taken
 * out and replaced by what they mean. 「卸妝濕巾」 and 「クレンジングシート」 share
 * no character and are the same thing; counted as characters they score zero,
 * counted as 「cleansing-sheet」 they are one unit that matches. What is left
 * after the noun is removed — the brand, the model, the size — is still
 * compared letter by letter, because that is what separates two products that
 * are both cleansing sheets.
 */
const overlap = (wanted: string, offered: string): number => {
  const wantedSplit = splitNouns(wanted);
  const offeredSplit = splitNouns(offered);

  const wantedLatin = latinWords(wantedSplit.rest);
  const offeredLatin = new Set(latinWords(offeredSplit.rest));
  const wantedCjk = cjkChars(wantedSplit.rest);
  const offeredCjk = new Set(cjkChars(offeredSplit.rest));
  const offeredConcepts = new Set(offeredSplit.concepts);

  const units = [...wantedLatin, ...wantedCjk, ...wantedSplit.concepts];
  if (units.length === 0) return 0;

  const shared = wantedLatin.filter(word => offeredLatin.has(word)).length
    + wantedCjk.filter(char => offeredCjk.has(char)).length
    + wantedSplit.concepts.filter(concept => offeredConcepts.has(concept)).length;
  return shared / units.length;
};

const says = (text: string, brand: string): boolean =>
  normalise(text).includes(normalise(brand));

/**
 * Whether an offer is the product that was asked for.
 *
 * `wanted.spec` is the row's own note — 「Muji · 12片裝」 — which is where a
 * size read off a screenshot ends up.
 */
export const matchProduct = (
  wanted: { name: string; brand?: string; spec?: string },
  offeredName: string,
): Match => {
  if (!offeredName.trim()) {
    return { confidence: 'none', reason: '這一頁沒有說它在賣什麼' };
  }

  /*
    Size first, and it can only reject. Two names that both state a size and
    state different ones are different products however alike they read —
    8x4 45ml and 8x4 60ml share every other character.
  */
  const wantedSizes = sizesIn(`${wanted.name} ${wanted.spec ?? ''}`);
  const offeredSizes = sizesIn(offeredName);
  if (wantedSizes.length > 0 && offeredSizes.length > 0
    && !wantedSizes.some(size => offeredSizes.includes(size))) {
    return {
      confidence: 'none',
      reason: `規格不同（要 ${wantedSizes.join('／')}，這頁是 ${offeredSizes.join('／')}）`,
    };
  }

  const brand = wanted.brand?.trim();
  const brandMatches = brand ? says(offeredName, brand) : undefined;

  const score = overlap(wanted.name, offeredName);

  /*
    A Latin word the asked-for name has and the page has not is usually the
    variant: 「ロキソプロフェンNaテープEX」 against 「ロキソプロフェンNaテープα」
    shares every character but the one that says which of the two it is. The
    names are alike enough to be worth showing and not alike enough to call
    the same thing.
  */
  const wantedLatin = latinWords(wanted.name);
  const offeredLatinWords = new Set(latinWords(offeredName));
  const missingLatin = wantedLatin.some(word => !offeredLatinWords.has(word));

  /*
    A name that matches almost completely is the product, whether or not the
    page repeats the brand — an official store writes 「潤唇精華油」 and leaves
    its own name to the header.
  */
  if (score >= 0.8 && !missingLatin) {
    return { confidence: 'exact', reason: '商品名稱相符' };
  }
  if (score >= 0.6 && brandMatches !== false && !missingLatin) {
    return { confidence: 'exact', reason: '品牌與名稱相符' };
  }
  if (score >= 0.6) {
    return {
      confidence: 'probable',
      reason: missingLatin ? '名稱相近，但型號或版本可能不同' : '名稱相符，但這頁沒寫品牌',
    };
  }
  if (score >= 0.34) {
    return {
      confidence: 'probable',
      reason: brandMatches ? '品牌相符，名稱部分相符' : '名稱部分相符',
    };
  }
  return { confidence: 'none', reason: '這一頁賣的是別的商品' };
};
