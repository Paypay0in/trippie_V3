/**
 * The two words a lookup needs: the brand and the name.
 *
 * 「搜尋應該是要品牌名+商品名」. A row read out of a screenshot keeps its brand
 * and its size in one note — 「Muji · 12片裝」, 「SK-II · 230ml」 — because the
 * name is what gets compared when the same bottle is added twice, and
 * 「SK-II 青春露 230ml」 and 「SK-II 青春露」 are the same thing to buy.
 *
 * The lookups were handed that whole note as the brand, so 卸妝濕巾 was
 * searched for as 「Muji · 12片裝 卸妝濕巾」 and came back with a book. A size
 * narrows a shelf and widens a search: no shop writes 「12片裝」 in its title
 * the way the screenshot did, so every result that matched it matched on
 * something else.
 */

import { mentionsBrand } from './brandNames';

/**
 * The brand out of a note that may also carry a size.
 *
 * Split on the separator the note is built with, never on a space: 「Jo
 * Malone」 and 「SHISEIDO PROFESSIONAL」 are two words each and one brand each.
 */
export const brandOf = (note?: string): string => {
  const written = (note ?? '').trim();
  /*
    A note with sentence punctuation in it is a sentence. 「聽說日本比較便宜，
    想買 2 瓶」 is a note somebody typed, not a company — and the note this
    reads is built by `candidateDetail`, which never writes a comma.
  */
  if (/[，。！？!?]/.test(written)) return '';
  const first = written.split(/[·、|/]/)[0].trim();
  return first.length > 0 && first.length <= 40 ? first : '';
};

/**
 * What to search for: brand first, because that is how a shelf is scanned
 * and how a shop writes its own titles.
 *
 * Unless the name already says it. 「Chanel 唇霜」 with the brand 「Chanel」 was
 * being asked for as 「Chanel Chanel 唇霜」, and a repeated word is a word the
 * search has to find twice. A row typed by hand carries the brand in the name
 * far more often than one read off a screenshot does.
 */
export const productQuery = (name: string, note?: string): string => {
  const written = (name ?? '').trim();
  const brand = brandOf(note);
  if (!brand) return written;
  return mentionsBrand(written, brand) ? written : `${brand} ${written}`.trim();
};
