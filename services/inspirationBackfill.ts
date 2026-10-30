/**
 * Saved places that never recorded where they are.
 *
 * Three separate symptoms in one night turned out to be this one gap: 「日本・
 * 日本」 under a saved place, the home screen collapsing every note in a country
 * into one card, and 「らぁ麺や 嶋 一帶」 as an area heading. In each case the
 * record carried a name and nothing else, so there was no address to read a
 * district out of and no city to group by.
 *
 * Google has the answer for all of them — 「らぁ麺や 嶋」 resolves to
 * 「3-chōme-41-11 Honmachi, Shibuya, Tokyo」 — it was simply never asked, because
 * these were saved before the save path looked anything up.
 *
 * Only blanks are filled. A traveller who corrected a place by hand has the
 * strongest claim on it, and a backfill that overwrote their correction would
 * be the one failure that makes this worse than leaving it alone.
 */
import { SavedTravelInspiration } from '../types';
import { CATEGORY_RULES } from './placeCategory';

export interface PlaceGap {
  id: string;
  placeName: string;
  /** Every saved row for this place; one lookup settles them together. */
  inspirationIds: string[];
  /**
   * The country this save already claims, which is the one to search in.
   *
   * 「這個是韓國釜山 不是加拿大」 — the backfill searched with the *open trip's*
   * country, so a Busan note looked at while a Japan trip was open was asked
   * for in the wrong country, and an English restaurant name found a real
   * place with the same name on the other side of the world.
   *
   * The save has said which country it is in since the day it was saved. That
   * is the fact; the trip on screen is a coincidence.
   */
  country?: string;
  /**
   * Where the save already believes it is, added to the search text.
   *
   * 「這不是在海雲台嗎 要放在釜山吧？」 — measured against the live route:
   *
   *   「Photowave」            → Place could not be resolved
   *   「Photowave Haeundae」   → 포토웨이브, 부산시, Haeundae
   *
   * A shop name alone is often not enough, and the record has been carrying
   * the answer the whole time. Its own district beats its city, which beats
   * nothing — the narrower the hint, the fewer shops of that name it competes
   * with.
   */
  near?: string;
}

/**
 * Whether this record knows where it is.
 *
 * A city equal to its own country is not a city — that is the exact shape the
 * old save path produced, taking the city from a trip whose destination field
 * held the country.
 */
/**
 * A city field that is actually holding a ward.
 *
 * 「還是雙語」 — 「韓國・Suyeong-gu」. Those saves were written before the city and
 * the ward were separated, so their city field holds the ward, and they look
 * settled to a check that only asks 「is there a city?」.
 *
 * Measured against the live Places response: Busan addresses carry no
 * `locality` at all — 「Busan」 is the region and 「Suyeong-gu」 the sublocality —
 * so these could only ever have come from the ward.
 *
 * The suffixes here are unambiguously below city level. 「City」 is included
 * only for Japan, where Google writes a bare 「Osaka」 and 「Sapporo」 for real
 * cities and reserves 「○○ City」 for Tokyo's wards; applying it everywhere
 * would make 「Ho Chi Minh City」 a ward.
 */
// i18n-data: regex anchor matched against Google's city names.
const WARD_SUFFIX = /(-gu|-gun|-eup|-ku|\s+Ward|[区區郡邑])$/i;
const JAPANESE_WARD_SUFFIX = /\s+City$/i;

export const cityLooksLikeDistrict = (
  place: { city?: string; country?: string; district?: string },
): boolean => {
  const city = (place.city || '').trim();
  if (!city) return false;
  // Already split: a save that knows both is not one of these.
  if (place.district?.trim()) return false;
  if (WARD_SUFFIX.test(city)) return true;
  // i18n-data: regex anchor matched against the stored country value.
  return /日本|japan|^jp$/i.test((place.country || '').trim()) && JAPANESE_WARD_SUFFIX.test(city);
};

/**
 * Whether this record has been asked what kind of place it is.
 *
 * 「沒有補標籤」 — the tag arrives with `primaryType`, which only a lookup can
 * fetch, so records resolved before tags existed carry none and nothing was
 * ever going to offer them again: they already know where they are and they
 * already carry the stamp.
 *
 * Terminating by construction. The resolve writes 「other」 when Google says
 * nothing, so one pass settles every record and no place is offered twice for
 * the same missing answer. A record with no `category` field at all has simply
 * never been through a lookup that could produce one.
 */
const knowsWhatItIs = (place: { category?: string; categoryRules?: number }): boolean =>
  Boolean(place.category) && place.categoryRules === CATEGORY_RULES;

export const knowsWhereItIs = (
  place: { formattedAddress?: string; city?: string; country?: string; district?: string },
): boolean => {

  const city = (place.city || '').trim();
  const country = (place.country || '').trim();
  const hasRealCity = Boolean(city) && city.toLowerCase() !== country.toLowerCase();
  return Boolean(place.formattedAddress?.trim())
    && hasRealCity
    // A ward sitting in the city field is not knowing which city it is in.
    && !cityLooksLikeDistrict(place);
};

/**
 * One entry per place that still needs looking up, keyed by name.
 *
 * Grouped by name because that is what the lookup takes, and two rows for the
 * same restaurant would otherwise spend two requests to learn the same fact.
 */
/**
 * Whether this record has been through the current lookup at all.
 *
 * 「目前的結果 放到海雲台 釜山是空的」 — 「Haeundae」 carries no suffix to spot it by,
 * and neither will the next one. Which records have been resolved since the
 * city and the ward were separated is a fact; which cities are secretly wards
 * is a guess that cannot be finished.
 *
 * Deliberately separate from `knowsWhereItIs`, which asks about the shape of
 * the data rather than its age — the row's own search button asks that one.
 */
const resolvedSinceTheSplit = (place: { placeResolvedAt?: string }): boolean =>
  Boolean(place.placeResolvedAt?.trim());

export const placesNeedingBackfill = (inspirations: SavedTravelInspiration[]): PlaceGap[] => {
  const gaps = new Map<string, PlaceGap>();
  inspirations.forEach(inspiration => {
    if (knowsWhereItIs(inspiration) && resolvedSinceTheSplit(inspiration) && knowsWhatItIs(inspiration)) return;
    const placeName = (inspiration.placeName || '').trim();
    if (!placeName) return;
    /*
      A city equal to the country is not a place hint, it is the shape this
      whole repair exists to undo.
    */
    const city = (inspiration.city || '').trim();
    const country = (inspiration.country || '').trim();
    const near = (inspiration.district || '').trim()
      || (city && city.toLowerCase() !== country.toLowerCase() ? city : '')
      || undefined;

    const existing = gaps.get(placeName);
    if (existing) {
      existing.inspirationIds.push(inspiration.id);
      existing.country = existing.country || country || undefined;
      existing.near = existing.near || near;
    } else {
      gaps.set(placeName, {
        id: placeName,
        placeName,
        inspirationIds: [inspiration.id],
        country: country || undefined,
        near,
      });
    }
  });
  return Array.from(gaps.values());
};
