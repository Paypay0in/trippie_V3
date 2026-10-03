/**
 * The words to search a place with.
 *
 * 「我還是希望要盡量找到資訊，你不能搜尋嗎？」. Two saved places sat there saying
 * 「尚未取得地點座標」, and the reason was visible in the row above them: the
 * screenshot had been saved with city 「韓國」 and country 「韓國」, so the lookup
 * went out as 「다곡소님 韓國 韓國」 — a query that cannot match anything, because
 * a country is not a neighbourhood and the word is in it twice.
 *
 * The same name with the actual city finds candidates immediately. So the query
 * is built rather than concatenated: the city only appears when it is a city,
 * nothing repeats, and the narrowest query is tried first.
 */

const clean = (value?: string): string => (value || '').trim();

/**
 * True when a value is the country repeated into the city field.
 *
 * A screenshot states no city, so the save falls back to the trip's
 * destination — and a trip entered as 「韓國」 puts a country in both fields.
 */
const isSameWord = (left: string, right: string): boolean =>
  Boolean(left) && left.toLocaleLowerCase() === right.toLocaleLowerCase();

export interface PlaceLookupContext {
  /** The city the trip is in, where the trip names one. */
  city?: string;
  country?: string;
  /**
   * Deliberately unused for the query text.
   *
   * A note like 「位於BIFF廣場附近」 looks like the detail that would separate one
   * 단골손님 from another, and searching 「단골손님 BIFF廣場 釜山」 was tried: Google
   * returns BIFF 廣場 itself. Autocomplete matches the whole string, so naming a
   * landmark beside a shop finds the landmark. Location is expressed as a
   * coordinate bias instead, where it narrows without competing.
   */
  notes?: string[];
  /** The trip's own coordinates, which bias the search towards where it is. */
  latitude?: number;
  longitude?: number;
}

/**
 * Queries to try, most specific first.
 *
 * Several rather than one because the most specific query is also the easiest
 * to get wrong: a hint read out of a note may be the wrong landmark, and a city
 * may be missing. Falling back costs one request and finds places the single
 * query missed.
 */
export const placeLookupQueries = (placeName: string, context: PlaceLookupContext = {}): string[] => {
  const name = clean(placeName);
  if (!name) return [];

  const country = clean(context.country);
  const city = clean(context.city);
  // A city that is really the country tells the search nothing it does not
  // already get from the country itself.
  const usableCity = city && !isSameWord(city, country) ? city : '';
  const queries = [
    [name, usableCity].filter(Boolean).join(' '),
    [name, usableCity || country].filter(Boolean).join(' '),
  ];

  /*
    Narrowest first, the bare name last.

    Two queries rather than one because a trip may name a city or only a
    country. The bare name is the last resort precisely because it matches most
    loosely — 「다곡소님」 alone returns a village in India — so it
    must never be tried while a narrower query is still available — the
    fallbacks collapse into it whenever there is no city and no hint.
  */
  const seen = new Set<string>();
  const narrowed = queries.filter(query => {
    const trimmed = query.trim();
    if (!trimmed || trimmed === name || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });

  return [...narrowed, name];
};
