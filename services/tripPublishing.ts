/**
 * Publishing a 行程, and reading somebody else's.
 *
 * The lifecycle rules are in `sharePublishing`, shared with collections. What
 * is here is what a trip has and a collection does not: days.
 *
 * A published trip grants reading of the itinerary and nothing else. The
 * expenses, the settlement, the companion list and the shopping list are not
 * in `PublishedTrip` at all — not hidden by a flag somewhere, simply absent, so
 * no screen can reach for them and no future edit can let one slip through.
 */

import {
  PublishedTrip,
  PublishedTripCard,
  PublishedTripStop,
  ItineraryItem,
  SavedCollectionItem,
  ShareVisibility,
} from '../types';
import { TripInspirationPlaceGroup } from './tripInspirationSelection';
import { inspirationGroupToItineraryItem } from './inspirationToItinerary';
import {
  Shareable,
  isShared,
  mintShareToken,
  publishShareable,
  sharedFromUrl,
  shareLink,
  unpublishShareable,
} from './sharePublishing';

/**
 * A trip's share state, with the absent fields read as what they mean.
 *
 * Every trip written before publishing existed has no `visibility` at all, and
 * absent has to read as 私人. Defaulting the other way, even once, publishes
 * somebody's itinerary because a column was added.
 */
export interface TripShareFields {
  id: string;
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  updatedAt?: string;
  visibility?: ShareVisibility;
  sharesOwnNotes?: boolean;
  sharesPhotos?: boolean;
  sharesPlaceDetails?: boolean;
  shareToken?: string;
  publishedAt?: string;
  revokedAt?: string;
}

export const tripShareState = (trip: TripShareFields): Shareable => ({
  visibility: trip.visibility ?? 'private',
  ...(trip.shareToken ? { shareToken: trip.shareToken } : {}),
  ...(trip.publishedAt ? { publishedAt: trip.publishedAt } : {}),
  ...(trip.revokedAt ? { revokedAt: trip.revokedAt } : {}),
  updatedAt: trip.updatedAt ?? new Date().toISOString(),
});

export const publishTrip = <T extends TripShareFields>(
  trip: T,
  visibility: Exclude<ShareVisibility, 'private'>,
  now: () => string = () => new Date().toISOString(),
  token: () => string = mintShareToken,
): T => {
  const shared = publishShareable(tripShareState(trip), visibility, now, token);
  const next: T = {
    ...trip,
    visibility: shared.visibility,
    publishedAt: shared.publishedAt,
    updatedAt: shared.updatedAt,
    /* The switches are a decision; publishing must not silently reset one. */
    sharesOwnNotes: trip.sharesOwnNotes ?? true,
    sharesPhotos: trip.sharesPhotos ?? true,
    sharesPlaceDetails: trip.sharesPlaceDetails ?? true,
  };
  if (shared.shareToken) next.shareToken = shared.shareToken;
  else delete next.shareToken;
  delete next.revokedAt;
  return next;
};

export const unpublishTrip = <T extends TripShareFields>(
  trip: T,
  now: () => string = () => new Date().toISOString(),
): T => {
  const shared = unpublishShareable(tripShareState(trip), now);
  return {
    ...trip,
    visibility: shared.visibility,
    revokedAt: shared.revokedAt,
    updatedAt: shared.updatedAt,
  };
};

/** Whether a stranger can reach this trip right now. */
export const isTripPublished = (trip: TripShareFields): boolean => isShared(tripShareState(trip));

/** The query parameter a visitor to a trip arrives with. */
export const TRIP_QUERY_PARAM = 'tr';

export const tripShareLink = (trip: TripShareFields, origin: string): string | undefined =>
  shareLink(tripShareState(trip), origin, TRIP_QUERY_PARAM, trip.id);

export const tripFromUrl = (
  search: string,
): { id: string; token?: string } | undefined => sharedFromUrl(search, TRIP_QUERY_PARAM);

/**
 * The stops of one calendar day, in the order a reader walks them.
 *
 * 「Day 1 3/12」 and what sits under it. Time first and blank last: a stop
 * nobody put a time on is a stop with no claim on a position, and sorting it
 * to the top would put 「找間咖啡廳」 before the 09:00 temple.
 */
export interface PublishedTripDay {
  /** The plain calendar date, as the itinerary stores it. */
  date: string;
  /** 1-based, for the 「Day 3」 label. Counted over the days that have stops. */
  dayNumber: number;
  stops: PublishedTripStop[];
}

export const publishedTripDays = (trip: PublishedTrip): PublishedTripDay[] => {
  const byDate = new Map<string, PublishedTripStop[]>();
  /*
    A stop with no date is not dropped and not guessed at either — it goes
    under the trip's start, which is where the planner already puts an
    undated item. Dropping it would make the 「32 個地點」 count on the card
    disagree with the page it opens, and a count that disagrees with its own
    list is the shape that costs this project days.
  */
  const fallback = trip.startDate ?? '';
  for (const stop of trip.stops) {
    const key = stop.date || fallback;
    const held = byDate.get(key);
    if (held) held.push(stop);
    else byDate.set(key, [stop]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stops], index) => ({
      date,
      dayNumber: index + 1,
      stops: [...stops].sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      }),
    }));
};

/**
 * How many nights the card claims — 「7 天」.
 *
 * Counted from the dates the owner set, not from the days that happen to hold
 * a stop: a trip with an empty Tuesday is still a seven-day trip, and saying
 * 6 would be this screen correcting the traveller about their own holiday.
 */
export const tripDayCount = (card: Pick<PublishedTripCard, 'startDate' | 'endDate'>): number => {
  if (!card.startDate || !card.endDate) return 0;
  const start = Date.parse(`${card.startDate}T00:00:00Z`);
  const end = Date.parse(`${card.endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
};

/**
 * The stops a visitor may save, which is not all of them.
 *
 * A flight and a hotel are a booking, not a place to go: saving 「華航 CI100」
 * into somebody's 收藏 gives them a row they can never use and clutters the
 * list that is supposed to be places. 「景點(32)」 counts what is left.
 */
export const savableStops = (stops: PublishedTripStop[]): PublishedTripStop[] =>
  stops.filter(stop => stop.type !== 'FLIGHT' && stop.type !== 'HOTEL'
    && (stop.title || '').trim().length > 0);

/**
 * A stop from somebody else's trip, as the place picker already understands it.
 *
 * An adapter rather than a second converter. 「A saved place becomes an
 * itinerary item」 is a rule with one home — `inspirationGroupToItineraryItem`,
 * which carries the Google identity, the address, the coordinates and the
 * original creator across. Writing a second one here for stops would be the
 * shape that has cost this project a day at a time: two paths, and one of
 * them quietly drops attribution.
 *
 * `sourceCreatorId` is the trip's owner, kept rather than recomputed: a
 * curator may be passing on somebody else's find, and §8 forbids the latest
 * sharer's identity overwriting the original author's.
 */
export const stopAsPlaceGroup = (
  stop: PublishedTripStop,
  trip: Pick<PublishedTrip, 'ownerId' | 'destination'>,
): TripInspirationPlaceGroup => ({
  id: stop.id,
  ...(stop.placeId ? { placeId: stop.placeId } : {}),
  placeName: stop.title,
  country: '',
  city: trip.destination ?? '',
  ...(stop.latitude != null && stop.longitude != null
    ? { coordinates: { latitude: stop.latitude, longitude: stop.longitude } }
    : {}),
  ...(stop.address ? { formattedAddress: stop.address } : {}),
  ...(stop.photos?.[0] ? { placePhotoUrl: stop.photos[0] } : {}),
  /*
    No inspiration ids. This place is not in the visitor's own saved store yet,
    and claiming an id that is not there would link the item to nothing.
  */
  inspirationIds: [],
  /*
    No experience notes either, and that is the honest shape rather than a
    gap. A `SavedExperienceNote` states which post, slice and note it came
    from; the owner's line about 淺草寺 came from none of those, and inventing
    those ids would put a citation on this screen that leads nowhere. Their
    words travel as the item's own note instead — see `stopToItineraryItem`.
  */
  experienceNotes: [],
  missingPlaceIdentity: !stop.placeId,
  matchBasis: stop.placeId ? 'placeId' : 'text',
  ...(trip.ownerId ? { sourceCreatorId: trip.ownerId } : {}),
});

/**
 * One stop of somebody else's trip, put on a day of your own — 加入我的行程.
 *
 * The item itself is built by the one converter that builds items. What is
 * added here is what only this route knows: the owner's line about the place,
 * and whatever the visitor typed into 備註.
 *
 * Both are kept and neither overwrites the other. 「來自 Ann 的東京咖啡地圖」 is
 * why the place is on the day at all, and a visitor's own reminder is the
 * reason they are adding it — collapsing the two into one field loses whichever
 * was written second.
 */
export const stopToItineraryItem = (
  stop: PublishedTripStop,
  trip: Pick<PublishedTrip, 'ownerId' | 'destination' | 'name'>,
  makeId: () => string,
  date?: string,
  remark?: string,
): ItineraryItem => {
  const item = inspirationGroupToItineraryItem(stopAsPlaceGroup(stop, trip), makeId, date);
  const lines = [
    ...(stop.notes ? [stop.notes] : []),
    ...(remark?.trim() ? [remark.trim()] : []),
  ];
  return {
    ...item,
    ...(stop.type === 'FOOD' ? { type: 'FOOD' as const } : {}),
    ...(lines.length > 0 ? { notes: lines.join('\n') } : {}),
  };
};

/**
 * A stop of somebody else's trip, as the save path already understands it.
 *
 * The same adapter reasoning as `stopAsPlaceGroup`: 「somebody else's place
 * becomes one of mine」 is a rule with one home — `savedFromCollectionItem`,
 * which decides attribution, lineage and what a saved record looks like. A
 * second copy written for stops is how one of the two paths ends up dropping
 * the creator's name.
 *
 * `sourceCollectionId` is the trip, because that is what the 「查看原始」 link
 * has to open. A trip and a collection are both just 「where this came from」
 * to a saved place.
 */
export const stopAsCollectionItem = (
  stop: PublishedTripStop,
  trip: Pick<PublishedTrip, 'id' | 'ownerId' | 'destination'>,
  position: number,
): SavedCollectionItem => ({
  id: stop.id,
  collectionId: trip.id,
  position,
  ...(stop.placeId ? { placeId: stop.placeId } : {}),
  placeName: stop.title,
  ...(stop.address ? { formattedAddress: stop.address } : {}),
  ...(stop.latitude != null ? { latitude: stop.latitude } : {}),
  ...(stop.longitude != null ? { longitude: stop.longitude } : {}),
  ...(stop.photos?.[0] ? { placePhotoUrl: stop.photos[0] } : {}),
  country: '',
  city: trip.destination ?? '',
  /*
    No notes. A `SavedExperienceNote` states which post, slice and note it came
    from, and the owner's line about this stop came from none of those —
    inventing those ids would put a citation on the saved place that leads
    nowhere. The words stay on the trip they were written about.
  */
  notes: [],
  ...(trip.ownerId ? { sourceCreatorId: trip.ownerId } : {}),
  sourceCollectionId: trip.id,
});
