/**
 * Saves that belong to this trip's country but cannot be placed on its map.
 *
 * 「我的東京儲存的旅遊靈感都不見了」 — on a 東京 trip, with 22 saved places and
 * one of them on screen.
 *
 * `matchesTripDestination` settles a city-scoped trip on coordinates when both
 * sides have them, and that is right. What is left over is the case this app
 * already knows it has, and says so in the banner directly above the list:
 * 「有的沒有地址，有的城市欄位放的其實是『區』」. A save with no coordinates and
 * `city: '台東區'` is in Tokyo, and the text comparison cannot know it — same
 * country, different-looking city, city-scoped trip, hidden.
 *
 * Hiding them is defensible: 大阪 should not appear on a 東京 trip, and without
 * a location there is no way to tell 台東區 from 大阪 except by the word. What
 * is not defensible is hiding them in silence, one box below a banner that
 * counts them and offers the repair. Two true statements, stacked, and the
 * reader left to conclude their collection is gone.
 *
 * This counts them so the list can say so and point at the button.
 */
import { SavedTravelInspiration } from '../types';
import {
  TripDestinationContext,
  isConfidentlyDifferentCountry,
  matchesTripDestination,
} from './tripInspirationSelection';

const hasLocation = (item: Pick<SavedTravelInspiration, 'latitude' | 'longitude'>): boolean =>
  typeof item.latitude === 'number' && Number.isFinite(item.latitude)
  && typeof item.longitude === 'number' && Number.isFinite(item.longitude)
  && !(item.latitude === 0 && item.longitude === 0);

/**
 * How many saves this trip's country holds that the list is not showing,
 * because they have no map position to judge them by.
 *
 * A save that *is* located and still did not match was judged on its
 * coordinates and is genuinely somewhere else; it is not counted, because
 * resolving it again would change nothing.
 */
export const hiddenSameCountrySaves = (
  inspirations: SavedTravelInspiration[],
  trip: TripDestinationContext,
): number => {
  const tripCountry = trip.destinationCountry || trip.travelCountry;
  return inspirations.filter(item => {
    if (matchesTripDestination(item, trip).matched) return false;
    if (hasLocation(item)) return false;
    // Unknown countries count: a save the table cannot place is exactly the
    // kind the backfill exists to repair.
    return !isConfidentlyDifferentCountry(item.country, tripCountry);
  }).length;
};
