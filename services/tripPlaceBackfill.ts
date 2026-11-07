/**
 * The place a trip is about, filled in for the trips that never got one.
 *
 * 「首圖不見了」 — a 新莊 trip showing the plain gradient. The photo was never
 * missing: `/api/places/resolve` answers 新莊 with 新莊區 and a photo, and
 * `/api/places/photo` returns it. The cover simply had nothing to ask with.
 *
 * `destinationPlaceId` is written in exactly one place — the `resolvePlace`
 * that runs while a trip is being created or edited (`App.tsx`). A trip made
 * before that field existed, or one whose lookup failed at the time (offline,
 * a quota answer, a name Google did not recognise), carries no placeId and has
 * no way to acquire one. `TripCover` then draws the gradient forever, which is
 * the right thing to draw with nothing to show and the wrong thing to be stuck
 * with.
 *
 * This repo's recurring fault in its other form: not one rule with two homes,
 * but one home that only new records ever pass through.
 *
 * So: one lookup, once, for a trip that is missing it. The placeId is the one
 * field Google permits to be kept indefinitely, so the trip never asks again.
 */
import { TripDraft } from './tripPersistence';

export type ResolvedTripPlace = {
  placeId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
};

/**
 * Whether this trip should spend a lookup.
 *
 * A trip with no destination has nothing to look up, and a trip that already
 * knows its place must never be asked again — repeating the lookup is how an
 * optional picture turns into a bill.
 */
export const needsPlaceBackfill = (draft: TripDraft | undefined): boolean =>
  Boolean(draft && draft.destination?.trim() && !draft.destinationPlaceId?.trim());

/**
 * The fields to write, or null when the answer carries nothing to write.
 *
 * Only the blanks are filled. The address, the coordinates and the country can
 * all have been corrected by the traveller or arrived from a companion's
 * device; a backfill that overwrites them would be answering a question nobody
 * asked. The placeId is the one thing this is here for, and without it there
 * is nothing worth recording — a half-filled trip would look resolved and
 * still show no cover.
 */
export const placeBackfillPatch = (
  draft: TripDraft,
  resolved: ResolvedTripPlace | null,
): Partial<TripDraft> | null => {
  const placeId = resolved?.placeId?.trim();
  if (!placeId) return null;
  return {
    destinationPlaceId: placeId,
    ...(draft.destinationAddress ? {} : resolved?.address ? { destinationAddress: resolved.address } : {}),
    ...(typeof draft.destinationLatitude === 'number' || typeof resolved?.latitude !== 'number'
      ? {}
      : { destinationLatitude: resolved.latitude }),
    ...(typeof draft.destinationLongitude === 'number' || typeof resolved?.longitude !== 'number'
      ? {}
      : { destinationLongitude: resolved.longitude }),
    ...(draft.destinationCountry ? {} : resolved?.country ? { destinationCountry: resolved.country } : {}),
  };
};
