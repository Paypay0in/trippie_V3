/**
 * Reading and writing the public half of a trip.
 *
 * Kept out of `tripSync` deliberately. That module upserts the whole trip row
 * on every ordinary save, and the publishing columns arrived in `0036` — a
 * trip row carrying a column the database has not got yet fails the upsert,
 * and the failure is not 「publishing is unavailable」, it is 「this trip no
 * longer syncs」. So the publish state is written by its own narrow update,
 * which can fail on its own without taking anybody's itinerary with it.
 *
 * Reading somebody else's goes through `read_public_trip`, a security-definer
 * function, for the reason `read_public_collection` already records: 僅連結 is
 * answered by holding a token, a token is not an identity, and no row policy
 * can check one.
 */

import {
  PublicProfileCounts,
  PublishedTrip,
  PublishedTripCard,
  PublishedTripStop,
} from '../types';
import { TripShareFields } from './tripPublishing';
import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

const text = (value: unknown): string | undefined => {
  const held = typeof value === 'string' ? value.trim() : '';
  return held.length > 0 ? held : undefined;
};

const count = (value: unknown): number => {
  const held = Number(value);
  return Number.isFinite(held) ? held : 0;
};

/**
 * The publish state of one trip, and nothing else about it.
 *
 * Only these columns. An update that also carried `name` or `start_date`
 * would make 分享 a second way to edit a trip, and the second way is always
 * the one that overwrites something somebody else had just changed.
 */
export const saveTripShareState = async (
  trip: TripShareFields,
): Promise<SyncResult<TripShareFields>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('trips')
      .update({
        visibility: trip.visibility ?? 'private',
        shares_own_notes: trip.sharesOwnNotes ?? true,
        shares_photos: trip.sharesPhotos ?? true,
        shares_place_details: trip.sharesPlaceDetails ?? true,
        share_token: trip.shareToken ?? null,
        published_at: trip.publishedAt ?? null,
        revoked_at: trip.revokedAt ?? null,
      })
      .eq('id', trip.id);
    if (error) throw error;
    return { status: 'ok', data: trip };
  } catch (error) {
    return failed(error);
  }
};

/** One stop as `read_public_trip` built it, with absent meaning withheld. */
export const fromPublicStopRow = (row: Record<string, unknown>): PublishedTripStop => ({
  id: String(row.id ?? ''),
  ...(text(row.date) ? { date: text(row.date) } : {}),
  time: typeof row.time === 'string' ? row.time : '',
  title: String(row.title ?? ''),
  type: (row.type as PublishedTripStop['type']) ?? 'ACTIVITY',
  ...(row.duration_minutes != null ? { durationMinutes: count(row.duration_minutes) } : {}),
  ...(row.rating != null ? { rating: count(row.rating) } : {}),
  ...(text(row.place_id) ? { placeId: text(row.place_id) } : {}),
  ...(text(row.location) ? { location: text(row.location) } : {}),
  ...(text(row.address) ? { address: text(row.address) } : {}),
  ...(row.latitude != null ? { latitude: count(row.latitude) } : {}),
  ...(row.longitude != null ? { longitude: count(row.longitude) } : {}),
  ...(text(row.notes) ? { notes: text(row.notes) } : {}),
  ...(Array.isArray(row.photos) && row.photos.length > 0
    ? { photos: row.photos.filter((photo): photo is string => typeof photo === 'string') }
    : {}),
});

/**
 * Somebody else's published trip.
 *
 * `not_found` for a trip that is private, unpublished, revoked, or asked for
 * without the token it needs — one answer for all of them, on purpose. 「這個
 * 不存在」 and 「這個你不能看」 are different sentences, and the second tells a
 * stranger that something is there.
 */
export const readPublicTrip = async (
  tripId: string,
  token?: string,
): Promise<SyncResult<PublishedTrip> | { status: 'not_found' }> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('read_public_trip', {
      trip_id: tripId,
      token: token ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: 'not_found' };
    const stops = Array.isArray(row.items) ? row.items : [];
    return {
      status: 'ok',
      data: {
        id: String(row.id),
        ownerId: String(row.owner_id ?? ''),
        name: String(row.name ?? ''),
        ...(text(row.destination) ? { destination: text(row.destination) } : {}),
        ...(text(row.start_date) ? { startDate: text(row.start_date) } : {}),
        ...(text(row.end_date) ? { endDate: text(row.end_date) } : {}),
        ...(text(row.published_at) ? { publishedAt: text(row.published_at) } : {}),
        stops: stops.map(fromPublicStopRow),
      },
    };
  } catch (error) {
    return failed(error);
  }
};

/** One person's 公開 trips, for their profile. Never their 僅連結 ones. */
export const listPublicTrips = async (
  ownerId: string,
): Promise<SyncResult<PublishedTripCard[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('list_public_trips', { owner: ownerId });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return {
      status: 'ok',
      data: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        ...(text(row.destination) ? { destination: text(row.destination) } : {}),
        ...(text(row.start_date) ? { startDate: text(row.start_date) } : {}),
        ...(text(row.end_date) ? { endDate: text(row.end_date) } : {}),
        ...(text(row.published_at) ? { publishedAt: text(row.published_at) } : {}),
        stopCount: count(row.stop_count),
        saveCount: count(row.save_count),
        ...(text(row.cover_photo) ? { coverPhoto: text(row.cover_photo) } : {}),
      })),
    };
  } catch (error) {
    return failed(error);
  }
};

/**
 * The figures under somebody's name — 旅行 / 城市 / 收藏.
 *
 * Asked of the server rather than counted from what this device happens to
 * hold: a profile showing 12 旅行 while listing 3 is a profile lying about a
 * stranger, and this device has no way to know how many of theirs it has.
 */
export const readPublicProfileCounts = async (
  ownerId: string,
): Promise<SyncResult<PublicProfileCounts>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('public_profile_counts', { owner: ownerId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return {
      status: 'ok',
      data: {
        tripCount: count(row?.trip_count),
        cityCount: count(row?.city_count),
        collectionCount: count(row?.collection_count),
        saveCount: count(row?.save_count),
      },
    };
  } catch (error) {
    return failed(error);
  }
};
