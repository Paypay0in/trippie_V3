import { ItineraryItem, SavedExperienceNote, SavedTravelInspiration } from '../types';
import { dedupeNoteTexts } from './itineraryImageSlices';
import { FixedScheduleEntry, fixedAnchorSchedule } from './itineraryDayFloor';

/**
 * Bridges the existing SavedTravelInspiration store into active Trip itinerary
 * planning. Everything here is read-only: nothing in this module mutates a
 * SavedTravelInspiration, a CommunityPost, or a PostSlice. Trip-side selection
 * is expressed as a separate, smaller contract.
 */

export interface TripDestinationContext {
  destination?: string;
  destinationCountry?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationPlaceId?: string;
  /** Legacy country field, used only when the trip has no resolved destinationCountry. */
  travelCountry?: string;
}

export type DestinationMatchBasis = 'placeId' | 'coordinates' | 'country' | 'text' | 'none';

export interface DestinationMatch {
  matched: boolean;
  basis: DestinationMatchBasis;
  distanceKm?: number;
}

export interface PlaceCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * The notes of one place, with the ones that only restate another removed.
 *
 * Works on the notes rather than on their text so the surviving note keeps its
 * id and its provenance — the picker matches planned places by those.
 */
const keepDistinctNotes = (notes: SavedExperienceNote[]): SavedExperienceNote[] => {
  const kept = dedupeNoteTexts(notes.map(note => note.text));
  const remaining = [...kept];
  return notes.filter(note => {
    const index = remaining.indexOf(note.text.trim());
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
};

export interface TripInspirationPlaceGroup {
  /** Stable, data-derived id. Never an array index. */
  id: string;
  placeId?: string;
  placeName: string;
  country: string;
  city: string;
  coordinates?: PlaceCoordinates;
  formattedAddress?: string;
  placePhotoUrl?: string;
  /** Every SavedTravelInspiration folded into this place group. */
  inspirationIds: string[];
  /** Notes keep their original attribution; nothing is merged away. */
  experienceNotes: SavedExperienceNote[];
  /** True when the saved data has neither a placeId nor usable coordinates. */
  missingPlaceIdentity: boolean;
  matchBasis: DestinationMatchBasis;
  distanceKm?: number;
}

export interface TripPlanningInspirationSelection {
  groupId: string;
  inspirationIds: string[];
  placeId?: string;
  placeName: string;
  country?: string;
  city?: string;
  coordinates?: PlaceCoordinates;
  /** Already-resolved formatted address, so the planner never re-looks-it-up. */
  address?: string;
  experienceNotes: SavedExperienceNote[];
  missingPlaceIdentity: boolean;
}

export interface TripPlanningInput {
  destination?: string;
  destinationCountry?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  selections: TripPlanningInspirationSelection[];
  /**
   * Free-text, trip-wide planner guidance typed by the user ("每天 11 點才出門",
   * "有租車"). This is a scheduling preference only: it never confers Saved
   * Inspiration provenance on anything the planner adds because of it.
   */
  planningPreferences?: string;
  /**
   * The flights already on the itinerary.
   *
   * 「怎麼會先入境金浦機場再去桃園機場」 — the planner used to be told the trip's
   * dates and nothing else, so it filled the arrival day from the morning and
   * landed them in Busan hours before their plane left Taoyuan. A day spent in
   * the air is not a day that can be planned over.
   */
  fixedSchedule?: FixedScheduleEntry[];
}

/**
 * A trip destination in Trippie is normally a city, so anything inside this
 * radius counts as reachable from it. Busan -> Haeundae is ~8km, Busan -> Daegu
 * ~88km, Busan -> Shibuya ~965km. Tuning this one constant is the whole knob.
 */
export const DESTINATION_RADIUS_KM = 100;

const normalizeText = (value?: string): string =>
  (value || '').trim().toLocaleLowerCase().replace(/[\s,，、.。'()（）·・-]/g, '');

/**
 * Country names reach this module from two different places: post authors type
 * them freely (usually Chinese) while the trip's destinationCountry comes back
 * from Google Places (usually English). Matching therefore needs aliases.
 */
const COUNTRY_ALIASES: string[][] = [
  ['japan', '日本', '日本國', 'jp'],
  ['southkorea', 'korea', 'republicofkorea', '韓國', '韩国', '南韓', '大韓民國', '한국', '대한민국', 'kr'],
  ['taiwan', '台灣', '臺灣', '中華民國', 'tw'],
  ['thailand', '泰國', '泰国', 'th'],
  ['unitedstates', 'unitedstatesofamerica', 'usa', 'us', 'america', '美國', '美国'],
  ['france', '法國', '法国', 'fr'],
  ['unitedkingdom', 'uk', 'england', 'britain', 'greatbritain', '英國', '英国', 'gb'],
  ['italy', 'italia', '義大利', '意大利', 'it'],
  ['germany', 'deutschland', '德國', '德国', 'de'],
  ['australia', '澳洲', '澳大利亞', 'au'],
  ['singapore', '新加坡', 'sg'],
  ['vietnam', 'vietname', '越南', 'vn'],
  ['china', 'peoplesrepublicofchina', '中國', '中国', 'cn'],
  ['hongkong', '香港', 'hk'],
  ['macau', 'macao', '澳門', '澳门', 'mo'],
];

const countryKey = (value?: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const groupIndex = COUNTRY_ALIASES.findIndex(group => group.includes(normalized));
  return groupIndex >= 0 ? `alias:${groupIndex}` : normalized;
};

/**
 * `mismatch-confident` means both names were recognised and they disagree, which
 * is safe to hide on. `mismatch-weak` means at least one name was an unrecognised
 * spelling, which is too thin an excuse to hide a user's own saved data.
 */
type CountryComparison = 'match' | 'mismatch-confident' | 'mismatch-weak' | 'unknown';

const compareCountry = (left?: string, right?: string): CountryComparison => {
  const leftKey = countryKey(left);
  const rightKey = countryKey(right);
  if (!leftKey || !rightKey) return 'unknown';
  if (leftKey === rightKey) return 'match';
  return leftKey.startsWith('alias:') && rightKey.startsWith('alias:')
    ? 'mismatch-confident'
    : 'mismatch-weak';
};

type TextComparison = 'match' | 'mismatch' | 'unknown';

const compareCity = (city?: string, destination?: string): TextComparison => {
  const cityText = normalizeText(city);
  const destinationText = normalizeText(destination);
  if (!cityText || !destinationText) return 'unknown';
  return cityText.includes(destinationText) || destinationText.includes(cityText) ? 'match' : 'mismatch';
};

/**
 * True when the user typed a country as the destination ("韓國" / "South Korea")
 * rather than a city. Such a trip must be able to reach places anywhere inside
 * that country, so distance alone must not rule them out.
 */
const isCountryScopedTrip = (trip: TripDestinationContext): boolean => {
  const destinationKey = countryKey(trip.destination);
  return Boolean(destinationKey) && destinationKey === countryKey(trip.destinationCountry || trip.travelCountry);
};

/**
 * True only when both country names were recognised and they disagree. Exposed so
 * place enrichment can reuse this alias table instead of growing a second one.
 */
export const isConfidentlyDifferentCountry = (left?: string, right?: string): boolean =>
  compareCountry(left, right) === 'mismatch-confident';

const toCoordinates = (latitude?: number, longitude?: number): PlaceCoordinates | undefined =>
  typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)
    ? { latitude, longitude }
    : undefined;

export const distanceInKm = (from: PlaceCoordinates, to: PlaceCoordinates): number => {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Structured identity wins over display text, in this order: placeId, then
 * coordinates, then country, and only then the destination string. Display-name
 * matching is never the deciding signal while structured data is available.
 */
export const matchesTripDestination = (
  item: Pick<SavedTravelInspiration, 'country' | 'city' | 'placeName' | 'placeId' | 'latitude' | 'longitude'>,
  trip: TripDestinationContext,
): DestinationMatch => {
  const tripPlaceId = trip.destinationPlaceId?.trim();
  const itemPlaceId = item.placeId?.trim();
  if (tripPlaceId && itemPlaceId && tripPlaceId === itemPlaceId) return { matched: true, basis: 'placeId' };

  const countryComparison = compareCountry(item.country, trip.destinationCountry || trip.travelCountry);
  const cityComparison = compareCity(item.city, trip.destination);
  const countryScoped = isCountryScopedTrip(trip);

  const tripCoordinates = toCoordinates(trip.destinationLatitude, trip.destinationLongitude);
  const itemCoordinates = toCoordinates(item.latitude, item.longitude);
  if (tripCoordinates && itemCoordinates) {
    const distanceKm = distanceInKm(tripCoordinates, itemCoordinates);
    if (distanceKm <= DESTINATION_RADIUS_KM) {
      // Proximity does not survive a confident country disagreement: Tsushima is
      // ~50km from Busan and still belongs to a Japan trip, not a Korea one.
      if (countryComparison === 'mismatch-confident') return { matched: false, basis: 'country', distanceKm };
      return { matched: true, basis: 'coordinates', distanceKm };
    }
    // Out of range settles a city-scoped trip. A country-scoped one falls back to
    // the country, otherwise a "South Korea" trip would hide everything but the
    // area around whatever point the country name happened to resolve to.
    if (!countryScoped) return { matched: false, basis: 'coordinates', distanceKm };
    return { matched: countryComparison === 'match', basis: 'country', distanceKm };
  }

  if (countryComparison === 'mismatch-confident') return { matched: false, basis: 'country' };
  if (cityComparison === 'match') return { matched: true, basis: 'text' };
  if (countryComparison === 'match') {
    // Same country, different city, and no coordinates to arbitrate. The ticket
    // asks for other cities to stay hidden on a city-scoped trip.
    if (cityComparison === 'mismatch' && !countryScoped) return { matched: false, basis: 'text' };
    return { matched: true, basis: 'country' };
  }
  return { matched: false, basis: 'none' };
};

/**
 * Place names keep their punctuation, because without a placeId the name is the
 * only identity there is and "Park-View" is not "ParkView". Country and city are
 * still normalized hard, since those are the fields authors type loosely.
 */
const normalizeName = (value?: string): string =>
  (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Fallback identity for a save that Google Places never resolved. */
const placeNameKey = (item: SavedTravelInspiration): string =>
  `name:${normalizeText(item.country)}|${normalizeText(item.city)}|${normalizeName(item.resolvedPlaceName || item.placeName)}`;

/**
 * placeId is the identity whenever it exists, so two different places that happen
 * to share a display name in one city never collapse into each other. A save with
 * no placeId joins its resolved twin only when that twin is unambiguous — if the
 * same name maps to several placeIds there is no way to tell which one it is, so
 * it stays in its own name-keyed group.
 */
const buildGroupKeyResolver = (items: SavedTravelInspiration[]): ((item: SavedTravelInspiration) => string) => {
  const placeIdsByNameKey = new Map<string, Set<string>>();
  items.forEach(item => {
    const placeId = item.placeId?.trim();
    if (!placeId) return;
    const nameKey = placeNameKey(item);
    const known = placeIdsByNameKey.get(nameKey) || new Set<string>();
    known.add(placeId);
    placeIdsByNameKey.set(nameKey, known);
  });

  return item => {
    const placeId = item.placeId?.trim();
    if (placeId) return `place:${placeId}`;
    const nameKey = placeNameKey(item);
    const candidates = placeIdsByNameKey.get(nameKey);
    return candidates?.size === 1 ? `place:${[...candidates][0]}` : nameKey;
  };
};

/**
 * Groups saved inspirations by Place. Source attribution on each note is copied
 * through untouched, and duplicate saves of the same source note collapse on
 * sourceNoteId rather than on note text.
 */
export const groupInspirationsByPlace = (
  items: SavedTravelInspiration[],
  matches?: Map<string, DestinationMatch>,
): TripInspirationPlaceGroup[] => {
  const groups = new Map<string, TripInspirationPlaceGroup>();
  const seenNoteIds = new Map<string, Set<string>>();
  const groupKeyOf = buildGroupKeyResolver(items);

  items.forEach(item => {
    const id = groupKeyOf(item);
    const match = matches?.get(item.id);
    const coordinates = toCoordinates(item.latitude, item.longitude);
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        placeId: item.placeId?.trim() || undefined,
        placeName: (item.resolvedPlaceName || item.placeName).trim(),
        country: item.country.trim(),
        city: item.city.trim(),
        coordinates,
        formattedAddress: item.formattedAddress,
        placePhotoUrl: item.placePhotoUrl,
        inspirationIds: [],
        experienceNotes: [],
        missingPlaceIdentity: true,
        matchBasis: match?.basis || 'none',
        distanceKm: match?.distanceKm,
      };
      groups.set(id, group);
      seenNoteIds.set(id, new Set());
    }

    // Later saves may carry identity the first one lacked; never drop it.
    if (!group.placeId && item.placeId?.trim()) group.placeId = item.placeId.trim();
    if (!group.coordinates && coordinates) group.coordinates = coordinates;
    if (!group.formattedAddress && item.formattedAddress) group.formattedAddress = item.formattedAddress;
    if (!group.placePhotoUrl && item.placePhotoUrl) group.placePhotoUrl = item.placePhotoUrl;
    group.inspirationIds.push(item.id);

    const seen = seenNoteIds.get(id) as Set<string>;
    item.notes.forEach(note => {
      if (seen.has(note.sourceNoteId)) return;
      seen.add(note.sourceNoteId);
      group.experienceNotes.push({ ...note });
    });
  });

  return Array.from(groups.values()).map(group => ({
    ...group,
    /*
      Restatements folded as the list is read, not only as it is written.

      「這三句語意相同，不能這樣列，要換成一句」 — the save that produced those three
      sentences is already in the database, and the rule that now prevents them
      only runs on the way in. Applying it here as well means the places he is
      looking at today read correctly, without rewriting rows he did not ask
      anyone to touch.
    */
    experienceNotes: keepDistinctNotes(group.experienceNotes),
    missingPlaceIdentity: !group.placeId && !group.coordinates,
  }));
};

/**
 * Which inspiration groups are already sitting in the official itinerary.
 *
 * Identity only, in the usual order: a resolved Google placeId is the strongest
 * proof, and a Saved Inspiration id is the fallback for a place that never got
 * one. A display name is deliberately not a fallback — two different places share
 * a name, and marking a place "already planned" on that basis would quietly hide
 * somewhere the user actually wants to go.
 *
 * Reads the canonical trip itinerary only. A pending AI proposal or a local
 * selection is not "in the itinerary" and must not grey anything out.
 */
export const selectPlannedInspirationGroupIds = (
  groups: TripInspirationPlaceGroup[],
  itinerary: Array<Pick<ItineraryItem, 'placeId' | 'sourceInspirationIds'>>,
): Set<string> => {
  const plannedPlaceIds = new Set<string>();
  const plannedInspirationIds = new Set<string>();
  itinerary.forEach(item => {
    const placeId = item.placeId?.trim();
    if (placeId) plannedPlaceIds.add(placeId);
    (item.sourceInspirationIds || []).forEach(id => {
      const trimmed = id.trim();
      if (trimmed) plannedInspirationIds.add(trimmed);
    });
  });

  const planned = new Set<string>();
  groups.forEach(group => {
    const placeId = group.placeId?.trim();
    if (placeId && plannedPlaceIds.has(placeId)) { planned.add(group.id); return; }
    if (group.inspirationIds.some(id => plannedInspirationIds.has(id))) planned.add(group.id);
  });
  return planned;
};

/** Filters the saved store down to the active trip's destination, then groups it. */
export const selectTripInspirationGroups = (
  items: SavedTravelInspiration[],
  trip: TripDestinationContext,
): TripInspirationPlaceGroup[] => {
  const matches = new Map<string, DestinationMatch>();
  const relevant = items.filter(item => {
    const match = matchesTripDestination(item, trip);
    matches.set(item.id, match);
    return match.matched;
  });
  return groupInspirationsByPlace(relevant, matches);
};

/**
 * The smallest contract the AI planning step needs. Deliberately excludes
 * CommunityPost bodies, slices, and anything else not required to plan a day.
 */
export const buildTripPlanningSelection = (
  groups: TripInspirationPlaceGroup[],
  selectedGroupIds: readonly string[],
): TripPlanningInspirationSelection[] => {
  const selected = new Set(selectedGroupIds);
  return groups.filter(group => selected.has(group.id)).map(group => ({
    groupId: group.id,
    inspirationIds: [...group.inspirationIds],
    placeId: group.placeId,
    placeName: group.placeName,
    country: group.country || undefined,
    city: group.city || undefined,
    coordinates: group.coordinates,
    address: group.formattedAddress,
    experienceNotes: group.experienceNotes.map(note => ({ ...note })),
    missingPlaceIdentity: group.missingPlaceIdentity,
  }));
};

export const tripDurationDays = (startDate?: string, endDate?: string): number | undefined => {
  if (!startDate || !endDate) return undefined;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.round((end - start) / 86_400_000) + 1;
};

/**
 * Founder-visible preview of exactly what the AI planning step would receive.
 * The same builder feeds both the first generation and every regenerate, so the
 * planner only ever has one input contract to satisfy.
 */
export const buildTripPlanningInput = (
  trip: TripDestinationContext & { startDate?: string; endDate?: string },
  selections: TripPlanningInspirationSelection[],
  planningPreferences?: string,
  existingItinerary?: ItineraryItem[],
): TripPlanningInput => ({
  destination: trip.destination?.trim() || undefined,
  destinationCountry: (trip.destinationCountry || trip.travelCountry)?.trim() || undefined,
  startDate: trip.startDate || undefined,
  endDate: trip.endDate || undefined,
  durationDays: tripDurationDays(trip.startDate, trip.endDate),
  selections,
  planningPreferences: planningPreferences?.trim() || undefined,
  // Flights only. Everything else on the itinerary is movable, and the planner
  // is allowed to propose around it.
  fixedSchedule: existingItinerary ? fixedAnchorSchedule(existingItinerary) : undefined,
});
