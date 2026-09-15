/**
 * Owner-identity normalization for the Expense compatibility boundary.
 *
 * The same human owner has been written under more than one id over time:
 *  - the legacy literal `me`
 *  - the canonical TripMember id `<tripId>:owner`
 *  - a canonical id built from a *different* trip id (draft id vs archived
 *    trip id), which is still the same human.
 *
 * Every one of those must collapse onto the active owner TripMember id before
 * it reaches expense state, otherwise the owner is counted twice in the
 * EQUAL-split denominator.
 *
 * Money is never summed across those aliases: they are duplicate
 * representations of one responsibility, not separate contributions. When two
 * aliases disagree on a non-zero amount the helper refuses to choose and
 * reports a conflict instead.
 */

export const LEGACY_OWNER_ID = 'me';

/** `<non-empty trip or draft id>:owner`. A bare `:owner` is malformed. */
const OWNER_ID_PATTERN = /^(.+):owner$/;

/** True when `id` refers to the trip owner under any historical encoding. */
export const isOwnerIdentity = (id: string): boolean => {
  if (id === LEGACY_OWNER_ID) return true;
  const match = OWNER_ID_PATTERN.exec(id);
  return match !== null && match[1].trim().length > 0;
};

/** Collapse any owner encoding onto the canonical owner TripMember id. */
export const normalizeOwnerMemberId = (
  id: string,
  ownerMemberId: string,
): string => (isOwnerIdentity(id) ? ownerMemberId : id);

/** Normalize and de-duplicate a beneficiary/member id list, preserving order. */
export const normalizeMemberIds = (
  ids: string[],
  ownerMemberId: string,
): string[] =>
  Array.from(new Set(ids.map(id => normalizeOwnerMemberId(id, ownerMemberId))));

/** Two aliases of one member carried different non-zero amounts. */
export interface MemberAmountConflict {
  memberId: string;
  /** The raw keys that collapsed onto `memberId`, with their stored amounts. */
  entries: Array<{ rawId: string; amount: number }>;
}

export interface NormalizedMemberAmounts {
  values: Record<string, number>;
  conflicts: MemberAmountConflict[];
}

/**
 * Normalize the keys of an allocation record.
 *
 * Duplicate representations of the same member are collapsed, never added:
 *  - one alias                        -> that amount
 *  - equal duplicates                 -> that amount once
 *  - canonical + zero alias           -> the non-zero amount
 *  - conflicting non-zero amounts     -> reported in `conflicts`
 *
 * On conflict `values` still holds a provisional amount (the canonical key's
 * own amount when it has one, otherwise the first non-zero seen) so the UI can
 * keep rendering, but callers must not persist a record that reports conflicts.
 */
export const normalizeMemberAmountRecord = (
  record: Record<string, number>,
  ownerMemberId: string,
): NormalizedMemberAmounts => {
  const grouped = new Map<string, Array<{ rawId: string; amount: number }>>();

  Object.entries(record).forEach(([rawId, amount]) => {
    const canonicalId = normalizeOwnerMemberId(rawId, ownerMemberId);
    const bucket = grouped.get(canonicalId);
    if (bucket) bucket.push({ rawId, amount });
    else grouped.set(canonicalId, [{ rawId, amount }]);
  });

  const values: Record<string, number> = {};
  const conflicts: MemberAmountConflict[] = [];

  grouped.forEach((entries, canonicalId) => {
    const nonZero = entries.filter(entry => entry.amount !== 0);

    if (nonZero.length === 0) {
      values[canonicalId] = entries[0].amount;
      return;
    }

    const distinct = Array.from(new Set(nonZero.map(entry => entry.amount)));
    if (distinct.length === 1) {
      values[canonicalId] = distinct[0];
      return;
    }

    // Genuine disagreement between aliases: surface it, never pick silently.
    const canonicalEntry = nonZero.find(entry => entry.rawId === canonicalId);
    values[canonicalId] = (canonicalEntry || nonZero[0]).amount;
    conflicts.push({ memberId: canonicalId, entries });
  });

  return { values, conflicts };
};

/** Human-readable one-line description of a monetary conflict, for debug/UI. */
export const describeMemberAmountConflicts = (
  conflicts: MemberAmountConflict[],
): string =>
  conflicts
    .map(
      conflict =>
        `${conflict.memberId}: ${conflict.entries
          .map(entry => `${entry.rawId}=${entry.amount}`)
          .join(' vs ')}`,
    )
    .join('; ');
