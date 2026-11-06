import { RowFingerprints } from './rowFingerprints';

/** The table these ids belong to, and the prefix its fingerprint keys carry. */
const TABLE = 'trip_inspirations';

/**
 * The saved-place ids this device may later delete.
 *
 * Not the ids on this phone. `alignInspirationRowIds` rewrites a row's id to
 * the server's before writing it, because two phones mint different ids for one
 * restaurant and inserting a second id for a place the index already holds
 * fails the whole batch. So after a push, the row on the server is addressed by
 * the REMOTE id — and a prune that names the local one deletes nothing,
 * silently, because removing zero rows is not an error.
 *
 * That is how 「這個東西我已經刪掉兩次了」 happened a third time: the place was
 * gone from the phone, still on the server, and the next read brought it back.
 * It only bites places that arrived from somewhere else — saved off another
 * traveller's collection, or recognised from a screenshot — since those are
 * exactly the ones whose ids get aligned.
 *
 * The aligned ids are already recorded, in the fingerprint keys the push
 * returns, so they are read from there rather than re-derived. One home: a
 * second alignment here would be a second opinion about what the server holds,
 * and the day it disagreed is the day a traveller's place came back again.
 *
 * `fallback` is used when the push reported no fingerprints for this table —
 * a failed or skipped write. Reading that as 「the server holds nothing」 would
 * let the next prune delete everything, so the ids this device was already
 * holding stand.
 */
export const knownInspirationIds = (
  fingerprints: RowFingerprints | undefined,
  fallback: string[],
): string[] => {
  const prefix = `${TABLE}:`;
  const ids = Object.keys(fingerprints || {})
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(Boolean);
  return ids.length > 0 ? ids : fallback;
};
