/**
 * The picture on a trip card, when no service photo arrived.
 *
 * 「這圖都不對」 — a trip to Tokyo and a trip to Okinawa both wore the same
 * photograph of Fushimi Inari, which is in Kyoto.
 *
 * Two faults, and the second is the one that made both cards identical:
 *
 *   1. 東京 and 日本 were pointed at the same photo id, so a trip whose
 *      destination had been set to the country — which is what destination
 *      detection writes — showed Japan's generic picture under the name of a
 *      city it is not a picture of.
 *   2. The lookup took the *first* key contained in the name, in whatever
 *      order the object happened to list them. 「日本沖繩」 contains 「日本」, and
 *      日本 is listed first, so Okinawa could never reach its own entry.
 *
 * Both are fixed by asking which key is the most specific rather than which
 * comes first, and by giving each place its own picture.
 */

/** Unsplash photo ids, one per place, each actually of that place. */
const FIXTURES: Record<string, string> = {
  // Japan
  // i18n-data: lookup key matched inside the destination text.
  東京: 'photo-1540959733332-eab4deabeeaf',
  tokyo: 'photo-1540959733332-eab4deabeeaf',
  // i18n-data: lookup key matched inside the destination text.
  大阪: 'photo-1528360983277-13d401cdc186',
  osaka: 'photo-1528360983277-13d401cdc186',
  // i18n-data: lookup key matched inside the destination text.
  京都: 'photo-1492571350019-22de08371fd3',
  kyoto: 'photo-1492571350019-22de08371fd3',
  // i18n-data: lookup key matched inside the destination text.
  沖繩: 'photo-1589452271712-64b8a66c7b71',
  // i18n-data: lookup key matched inside the destination text.
  沖縄: 'photo-1589452271712-64b8a66c7b71',
  okinawa: 'photo-1589452271712-64b8a66c7b71',
  // i18n-data: lookup key matched inside the destination text.
  北海道: 'photo-1542051841857-5f90071e7989',
  hokkaido: 'photo-1542051841857-5f90071e7989',
  // The country's own picture, for a trip that only says which country.
  // i18n-data: lookup key matched inside the destination text.
  日本: 'photo-1493976040374-85c8e12f0c0e',
  japan: 'photo-1493976040374-85c8e12f0c0e',

  // Korea
  // i18n-data: lookup key matched inside the destination text.
  釜山: 'photo-1538485399081-7c897a0c8d7b',
  busan: 'photo-1538485399081-7c897a0c8d7b',
  // i18n-data: lookup key matched inside the destination text.
  首爾: 'photo-1538669715315-155098f0fb1d',
  seoul: 'photo-1538669715315-155098f0fb1d',
  // i18n-data: lookup key matched inside the destination text.
  濟州島: 'photo-1539650116574-75c0c6d73f6e',
  // i18n-data: lookup key matched inside the destination text.
  濟州: 'photo-1539650116574-75c0c6d73f6e',
  jeju: 'photo-1539650116574-75c0c6d73f6e',

  // Elsewhere
  // i18n-data: lookup key matched inside the destination text.
  巴黎: 'photo-1502602898657-3e91760cbb34',
  paris: 'photo-1502602898657-3e91760cbb34',
  // i18n-data: lookup key matched inside the destination text.
  聖托里尼: 'photo-1570077188670-e3a8d69ac5ff',
  santorini: 'photo-1570077188670-e3a8d69ac5ff',
};

const DEFAULT_FIXTURE = 'photo-1500534623283-312aade485b7';

/**
 * Keys that name a whole country rather than somewhere to photograph.
 *
 * A country is always the less specific of two answers, whatever its name
 * happens to be spelled with — 「日本」 and 「沖繩」 are both two characters, so
 * comparing lengths got this exactly wrong.
 */
// i18n-data: lookup keys of FIXTURES, matched not displayed.
const COUNTRY_KEYS = new Set(['日本', 'japan']);

const namesACity = (key?: string): boolean => Boolean(key) && !COUNTRY_KEYS.has(key!);

/**
 * The most specific place named anywhere in the text.
 *
 * A city beats a country, then the longer key beats the shorter — so 「日本沖繩」
 * is Okinawa, and 「北海道」 is not read as some shorter key inside it. A trip
 * names its country and its city together more often than not, and the city is
 * the one the picture should be of.
 *
 * Ordered explicitly rather than by where the keys happen to sit in the object.
 * Taking whichever came first is the fault this function exists to fix, and
 * 日本 and 沖繩 are the same length, so length alone would leave it to chance.
 */
export const fixtureKeyFor = (destination?: string): string | undefined => {
  const text = (destination || '').trim().toLocaleLowerCase();
  if (!text) return undefined;
  return Object.keys(FIXTURES)
    .filter(key => text.includes(key))
    .sort((left, right) =>
      Number(namesACity(right)) - Number(namesACity(left))
      || right.length - left.length)[0];
};

export const fixtureImageFor = (destination?: string): string => {
  const key = fixtureKeyFor(destination);
  const id = (key && FIXTURES[key]) || DEFAULT_FIXTURE;
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85`;
};

/**
 * What to ask the photo service for.
 *
 * The trip's own name beats a destination field holding only the country —
 * 「日本沖繩」 is a better query than 「日本」, and destination detection writes
 * the country into that field, which is how two different trips came to ask
 * for the same photograph.
 *
 * Falls back to the destination when the name says nothing a picture could be
 * of, which is most trips called 「我的旅程」.
 */
export const coverImageQuery = (destination?: string, tripName?: string): string => {
  const name = (tripName || '').trim();
  const place = (destination || '').trim();
  if (!name) return place;
  if (!place) return name;

  /*
    The name wins only when it names a city and the destination does not. A
    destination field holding 「日本」 is a country, and a trip called 「日本沖繩」
    names the island — which is the picture the card should wear.
  */
  const nameKey = fixtureKeyFor(name);
  const placeKey = fixtureKeyFor(place);
  if (namesACity(nameKey) && !namesACity(placeKey)) return name;
  return place;
};
