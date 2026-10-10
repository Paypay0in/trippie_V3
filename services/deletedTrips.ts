/**
 * Trips this device has been told to forget.
 *
 * 「我已全部都刪掉過了 但又一直出現」.
 *
 * Deleting a trip rewrote the local store and the local state and told the
 * cloud nothing. The merge that runs on every sign-in then asks the server for
 * every trip on the account, keeps the ones this device does not have, and
 * adds them — so a deleted trip was, by that definition, exactly a trip to be
 * restored. He deleted them repeatedly and they came back every time, which is
 * the worst version of the bug: the app contradicting an instruction it
 * appeared to accept.
 *
 * A tombstone is the smallest honest fix. It is device-local, like the
 * 「not duplicates」 answers, because carrying it to the cloud needs a column
 * that is not there yet — and because the alternative, deleting the row for
 * real, is not the same request. A shared trip belongs to everyone on it;
 * 「remove this from my phone」 must never be the thing that destroys the
 * ledger his travelling companion is still settling from.
 *
 * So the row survives and this device stops being offered it. Joining the same
 * trip again by invite clears the mark, because that is somebody asking for it
 * back in as many words.
 */

export const DELETED_TRIPS_STORAGE_KEY = 'trippie_deleted_trips_v1';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_TRIPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
  } catch {
    return [];
  }
};

const write = (ids: string[]): void => {
  try {
    // Capped and newest-kept: this is a list of refusals, not a history.
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify(ids.slice(-300)));
  } catch {
    /*
      A blocked store costs the trip reappearing on the next sign-in, which is
      the behaviour this replaces — bad, but not worse, and not worth losing
      the delete over.
    */
  }
};

export const deletedTripIds = (): string[] => read();

export const rememberDeletedTrip = (id: string): void => {
  if (!id) return;
  const current = read();
  if (current.includes(id)) return;
  write([...current, id]);
};

/** Someone asked for it back, in as many words. */
export const forgetDeletedTrip = (id: string): void => {
  if (!id) return;
  const current = read();
  if (!current.includes(id)) return;
  write(current.filter(existing => existing !== id));
};

export const isTripDeleted = (id: string, deleted: string[] = read()): boolean =>
  deleted.includes(id);

/** The cloud trips this device should still be offered. */
export const withoutDeleted = <T extends { id: string }>(
  trips: T[],
  deleted: string[] = read(),
): T[] => {
  if (deleted.length === 0) return trips;
  const gone = new Set(deleted);
  return trips.filter(trip => !gone.has(trip.id));
};
