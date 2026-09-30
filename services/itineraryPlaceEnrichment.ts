import { ResolvedPlace, resolvePlace } from './placeService';
import { ProposedItineraryItem, TripInspirationProposal } from './itineraryPlanningService';
import { DESTINATION_RADIUS_KM, distanceInKm, isConfidentlyDifferentCountry, PlaceCoordinates } from './tripInspirationSelection';

/**
 * Best-effort Google Places enrichment for AI-suggested proposal items, run just
 * before an accepted proposal is written to the official itinerary.
 *
 * Two rules govern everything here:
 *  - A saved place is never re-resolved. Its canonical identity already came from
 *    the user's own saved data and a name search must not be allowed to overwrite it.
 *  - Resolving an AI suggestion never changes its provenance. It gains a placeId,
 *    coordinates, an address and therefore a photo, but it stays `ai_suggestion`
 *    with no sourceInspirationIds. A name is still not Saved Inspiration identity.
 */

export interface PlaceEnrichmentContext {
  /** Trip city as the user entered it, e.g. 釜山. */
  destination?: string;
  destinationCountry?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
}

export type PlaceMatchRejection =
  | 'no-result'
  | 'not-google-identity'
  | 'no-coordinates'
  | 'different-country'
  | 'too-far';

export type PlaceMatchVerdict =
  | { safe: true; place: ResolvedPlace }
  | { safe: false; reason: PlaceMatchRejection };

const toCoordinates = (latitude?: number, longitude?: number): PlaceCoordinates | undefined =>
  typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)
    ? { latitude, longitude }
    : undefined;

/**
 * The search text. A bare place name resolves against the whole planet, so the trip
 * city and country go into the query — that is what turns "札嘎其市場" into the Busan
 * fish market rather than something similarly named elsewhere.
 */
export const buildPlaceQuery = (placeName: string, context: PlaceEnrichmentContext): string =>
  [placeName.trim(), context.destination?.trim(), context.destinationCountry?.trim()]
    .filter(Boolean)
    .join(' ');

/**
 * Decides whether a resolved place is consistent enough to attach.
 *
 * Deliberately NOT gated on the name matching: a generic request like 「汗蒸幕」
 * legitimately resolves to a specific venue, and demanding string similarity would
 * throw those away. Geography and country are the checks that actually falsify a
 * bad match, and they are verifiable rather than a guess.
 *
 * `resolvedPlaceName` is required because only the Google Places branch of
 * /api/places/resolve sets it. The geocoding fallbacks can return a numeric id that
 * is not a Google place id, and attaching that would produce an itinerary item whose
 * photo lookup can never succeed.
 */
export const isSafePlaceMatch = (
  place: ResolvedPlace | null,
  context: PlaceEnrichmentContext,
): PlaceMatchVerdict => {
  if (!place) return { safe: false, reason: 'no-result' };
  if (!place.placeId?.trim() || !place.resolvedPlaceName?.trim()) return { safe: false, reason: 'not-google-identity' };

  const coordinates = toCoordinates(place.latitude, place.longitude);
  if (!coordinates) return { safe: false, reason: 'no-coordinates' };

  if (isConfidentlyDifferentCountry(place.country, context.destinationCountry)) {
    return { safe: false, reason: 'different-country' };
  }

  const tripCoordinates = toCoordinates(context.destinationLatitude, context.destinationLongitude);
  if (tripCoordinates && distanceInKm(tripCoordinates, coordinates) > DESTINATION_RADIUS_KM) {
    return { safe: false, reason: 'too-far' };
  }

  return { safe: true, place };
};

/**
 * Which items enrichment is even allowed to touch: anything that has no canonical
 * placeId yet.
 *
 * A saved place that already carries a placeId is never re-resolved — its identity
 * came from the user's own saved data and a name search must not overwrite it. But
 * a saved place that never had one is exactly what the planner promises to resolve
 * later (「尚未取得地點座標，AI 規劃時再解析」), so it is included here. Resolving it
 * does not change what it is: provenance is set by `source` and
 * `sourceInspirationIds`, and enrichment touches neither.
 */
export const needsPlaceEnrichment = (item: ProposedItineraryItem): boolean =>
  !item.placeId?.trim();

export interface PlaceEnrichmentSummary {
  attempted: number;
  resolved: number;
  /** Kept as text-only because no safe match was found or the lookup failed. */
  unresolved: number;
}

export interface PlaceEnrichmentOutcome {
  proposal: TripInspirationProposal;
  summary: PlaceEnrichmentSummary;
}

type PlaceResolver = (query: string, country?: string) => Promise<ResolvedPlace | null>;

/**
 * Returns a copy of the proposal with AI-suggested places enriched where a safe
 * match was found. Enrichment is best effort by construction: a rejected match, a
 * failed request and a thrown resolver all leave the item exactly as it was, so
 * acceptance can continue and the item persists as text-only with its time intact.
 */
export const enrichProposalPlaces = async (
  proposal: TripInspirationProposal,
  context: PlaceEnrichmentContext,
  resolve: PlaceResolver = resolvePlace,
): Promise<PlaceEnrichmentOutcome> => {
  const targets = proposal.days.flatMap(day => day.items.filter(needsPlaceEnrichment));
  if (targets.length === 0) {
    return { proposal, summary: { attempted: 0, resolved: 0, unresolved: 0 } };
  }

  // One lookup per distinct name: the same suggestion can appear under different
  // days, and repeating the request would just spend quota to get the same answer.
  const uniqueNames = Array.from(new Set(targets.map(item => item.placeName.trim()).filter(Boolean)));
  const resolvedByName = new Map<string, ResolvedPlace>();

  await Promise.all(uniqueNames.map(async name => {
    const place = await resolve(buildPlaceQuery(name, context), context.destinationCountry).catch(() => null);
    const verdict = isSafePlaceMatch(place, context);
    if (verdict.safe) resolvedByName.set(name, verdict.place);
  }));

  let resolved = 0;
  const days = proposal.days.map(day => ({
    ...day,
    items: day.items.map(item => {
      if (!needsPlaceEnrichment(item)) return item;
      const match = resolvedByName.get(item.placeName.trim());
      if (!match) return item;
      resolved += 1;
      return {
        ...item,
        placeId: match.placeId,
        coordinates: toCoordinates(match.latitude, match.longitude) || item.coordinates,
        address: match.address || item.address,
        // The canonical Google name replaces the model's wording for an AI
        // suggestion, which is how 「汗蒸幕」 becomes the venue that was actually
        // resolved. A saved place keeps the name the user saved it under: that name
        // is theirs, and this lookup was only ever filling in a missing identity.
        placeName: item.source === 'ai_suggestion' && match.resolvedPlaceName?.trim()
          ? match.resolvedPlaceName.trim()
          : item.placeName,
        // Provenance is untouched on purpose. A Google lookup does not make this a
        // saved inspiration, and it does not stop one being one: `source`,
        // `sourceInspirationIds` and `experienceNotes` all pass through unchanged.
      };
    }),
  }));

  return {
    proposal: { ...proposal, days },
    summary: { attempted: targets.length, resolved, unresolved: targets.length - resolved },
  };
};

export interface PlacePreview {
  /** What the same resolution the apply step runs would attach, if anything. */
  resolved?: ResolvedPlace;
  /** Why it would not, when it would not. */
  rejection?: PlaceMatchRejection;
}

/**
 * What enrichment *would* do, without doing it.
 *
 * The preview card named a place and said nothing about whether that place
 * exists. So a suggestion built from an Instagram handle — a name no map has —
 * looked exactly like one pinned to a real address, and the traveller only
 * found out after accepting it.
 *
 * Runs the identical query and the identical safety check as the apply step,
 * deliberately: a preview that uses its own logic is a preview that can
 * disagree with what happens next, which is worse than no preview.
 */
export const previewPlaceResolution = async (
  placeNames: string[],
  context: PlaceEnrichmentContext,
  resolve: PlaceResolver = resolvePlace,
): Promise<Map<string, PlacePreview>> => {
  const unique = Array.from(new Set(placeNames.map(name => name.trim()).filter(Boolean)));
  const previews = new Map<string, PlacePreview>();

  await Promise.all(unique.map(async name => {
    const place = await resolve(buildPlaceQuery(name, context), context.destinationCountry).catch(() => null);
    const verdict: PlaceMatchVerdict = isSafePlaceMatch(place, context);
    previews.set(name, verdict.safe === true
      ? { resolved: verdict.place }
      : { rejection: verdict.reason });
  }));

  return previews;
};
