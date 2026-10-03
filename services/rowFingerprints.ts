/**
 * Which rows this device actually changed.
 *
 * 「Gina打開就覆蓋掉我們剛剛更新的資料了」. Opening the trip publishes the whole
 * local list — 19 saved places, every itinerary item, every expense — so every
 * row on the server was stamped with one device's copy of it, in one second,
 * simply because somebody opened the app. Whoever opened last decided what the
 * trip said.
 *
 * Most of the time that is invisible, because both devices hold the same thing.
 * It stops being invisible the moment one of them is a few seconds behind: a
 * phone that read the trip before the other finished editing rewrites the older
 * copy over the newer one, and nobody deleted anything.
 *
 * The fix is to send only what differs from what this device knows is on the
 * server. A row nobody touched is not written, so it cannot be reverted; a row
 * this device genuinely changed still goes, because its fingerprint moved.
 *
 * Deliberately not a merge: last-write-wins is still the rule for a row two
 * people really did edit at once. This only stops a write that says nothing.
 */

/** What the server is believed to hold, as `table:id` -> row fingerprint. */
export type RowFingerprints = Record<string, string>;

/**
 * A row's content, as one comparable string.
 *
 * `trip_id` is excluded because it is context rather than content, and
 * key order comes from the mappers, which build every row literal the same way
 * — so two equal rows always produce equal text.
 */
export const fingerprintOf = (row: Record<string, unknown>): string => {
  const { trip_id: _tripId, ...content } = row;
  return JSON.stringify(content);
};

const keyOf = (table: string, id: unknown): string => `${table}:${String(id)}`;

/**
 * The rows worth sending.
 *
 * A row with no recorded fingerprint is always sent: this device has never seen
 * it on the server, so not sending it is how a record stays on one phone.
 */
export const changedRows = <T extends { id: string }>(
  table: string,
  rows: T[],
  known?: RowFingerprints,
): T[] => {
  if (!known) return rows;
  return rows.filter(row => known[keyOf(table, row.id)] !== fingerprintOf(row as unknown as Record<string, unknown>));
};

/** Records what the server now holds, leaving other tables' entries alone. */
export const withFingerprints = <T extends { id: string }>(
  previous: RowFingerprints | undefined,
  table: string,
  rows: T[],
): RowFingerprints => {
  const next = { ...(previous || {}) };
  rows.forEach(row => {
    next[keyOf(table, row.id)] = fingerprintOf(row as unknown as Record<string, unknown>);
  });
  return next;
};
