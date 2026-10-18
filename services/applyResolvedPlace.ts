import { SavedTravelInspiration } from '../types';
import { CATEGORY_RULES, placeCategory } from './placeCategory';
import { preferredCountryName } from './countryIdentity';

/**
 * What a resolve writes onto a saved place.
 *
 * 「這邊我做過了 已經重新定位過了 結果沒有儲存」.
 *
 * Every field here used to be written unconditionally, so a later resolve that
 * came back without coordinates — a details call that answered with an id and
 * little else, or the silent backfill passing over the same record — wrote
 * `undefined` over the position a rebind had just put there. The place went
 * straight back under 「還沒定位的地點」 and nothing on screen said why.
 *
 * So: a resolve states what it found. It never states what it did not find.
 * An empty answer leaves the record alone, which is the rule the `city` line
 * had already learned on its own for exactly the same reason.
 */
export interface ResolvedPlaceFields {
  placeId: string;
  placeName: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  district?: string;
  country?: string;
  /** Google's category enum, folded into the 🏷️ tag. See `placeCategory`. */
  primaryType?: string;
}

const located = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const applyResolvedPlace = (
  inspiration: SavedTravelInspiration,
  resolved: ResolvedPlaceFields,
): SavedTravelInspiration => ({
  ...inspiration,
  placeId: resolved.placeId,
  resolvedPlaceName: resolved.placeName || inspiration.resolvedPlaceName,
  formattedAddress: resolved.address || inspiration.formattedAddress,
  /*
    Both or neither. Half a position is not a position, and a latitude kept
    beside a dropped longitude is a record that passes 「has coordinates」 and
    cannot be drawn.
  */
  ...(located(resolved.latitude) && located(resolved.longitude)
    ? { latitude: resolved.latitude, longitude: resolved.longitude }
    : {}),
  city: resolved.city || inspiration.city,
  district: resolved.district || inspiration.district,
  // Stamped even when no ward came back, so a place that has none is
  // corrected once rather than offered forever.
  placeResolvedAt: new Date().toISOString(),
  /*
    A real answer beats a blank, and a blank leaves whatever the screenshot
    already said: a save tagged 餐廳 by its own slice is not emptied by a
    resolve that came back without a type.

    Written even as 「other」, which is the record saying 「asked, and the answer
    was nothing」 — that is what ends the backfill loop. It is never printed.
  */
  category: placeCategory({ primaryType: resolved.primaryType }) !== 'other'
    ? placeCategory({ primaryType: resolved.primaryType })
    : inspiration.category || 'other',
  // Which rules read it, so a better reading can reach it later.
  categoryRules: CATEGORY_RULES,
  country: preferredCountryName(inspiration.country, resolved.country),
});
