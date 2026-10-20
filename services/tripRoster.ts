import { Companion, TripMember } from '../types';
import { isOwnerIdentity, normalizeOwnerMemberId } from './memberIdentity';

/**
 * The trip roster: who is on this trip, and which of them is looking.
 *
 * Until now the roster was rebuilt inline at every call site and the viewer was
 * assumed to be the owner, so the ownership rules in expensePermissions could
 * only ever answer "yes". This module is the single place that answers two
 * questions:
 *
 *   1. Which TripMembers exist for this trip?   -> buildTripRoster
 *   2. Which one is the current viewer?          -> resolveViewerMemberId
 *
 * Nothing here syncs, invites, or persists. It derives a canonical roster from
 * data the app already holds (trip id, signed-in user, companions, friends).
 */

/** `<tripId>:owner` — the canonical owner TripMember id for a trip or draft. */
export const ownerMemberId = (tripId: string): string => `${tripId}:owner`;

/**
 * A member id must never be shaped like an owner id.
 *
 * `isOwnerIdentity` treats any `<something>:owner` as the trip owner, so a
 * companion minted with that shape would silently inherit owner permission.
 * Roster building rejects such ids rather than letting them through.
 */
export const isOwnerShapedId = (id: string): boolean => isOwnerIdentity(id);

/**
 * Whose trip this is, when the stored answer is missing.
 *
 * 「Sherry 的帳本 有帳但不能儲存 分帳的部分也不會自動計算」.
 *
 * The owner seat was built with `draft.ownerId || viewerUserId` — so a trip
 * whose `ownerId` had not arrived yet put *her* auth id in *his* seat. And
 * `resolveViewer` checks the owner seat first, so she then matched as the
 * owner, with `isResolved: true`: no banner, no warning, every permission
 * question answering 「yes, you are」.
 *
 * Two things follow, and both are about money. `calculateTripDebts` folds
 * every owner alias onto the owner's id, so she and he became one member and
 * the whole split cancelled to zero. And her own records were filed under his
 * seat, which is why she could not edit them again.
 *
 * The missing piece is evidence: a companion seat carrying this account's id
 * is proof that this account is a *member*, which is proof it is not the
 * owner. In that case the owner is somebody whose id this device has not been
 * told, and the seat says so by carrying none — which is the honest answer,
 * and the one that lets `resolveViewer` fall through to her real seat.
 *
 * A trip with no `ownerId` and no companion claiming this account is a trip
 * only this device has ever had. That one is genuinely the reader's.
 */
export const ownerUserIdFor = ({
  storedOwnerId,
  viewerUserId,
  companions,
}: {
  storedOwnerId?: string;
  viewerUserId?: string;
  companions: Companion[];
}): string | undefined => {
  const stored = storedOwnerId?.trim();
  if (stored) return stored;
  if (!viewerUserId?.trim()) return undefined;

  const holdsASeat = companions.some(companion =>
    companion.userId === viewerUserId || companion.id === viewerUserId);
  return holdsASeat ? undefined : viewerUserId;
};

export interface BuildTripRosterInput {
  tripId: string;
  /** Auth (or anonymous) user id of the trip owner. */
  ownerUserId?: string;
  ownerName?: string;
  companions: Companion[];
  /**
   * Known friends. Their ids are auth user ids, so a companion whose id matches
   * a friend is a real account on this trip rather than a name-only guest.
   */
  friends?: Companion[];
}

/**
 * Build the canonical roster: owner first, then companions in stored order.
 *
 * - Owner keeps the canonical `<tripId>:owner` id and carries `userId` so the
 *   signed-in owner can be recognised.
 * - A companion whose id matches a known friend is typed `member` and carries
 *   that auth `userId`; everyone else stays a name-only `guest`.
 * - Owner-shaped and duplicate companion ids are dropped, never renamed: a
 *   silently rewritten id would break the expenses that already reference it.
 */
export const buildTripRoster = ({
  tripId,
  ownerUserId,
  ownerName,
  companions,
  friends = [],
}: BuildTripRosterInput): TripMember[] => {
  const ownerId = ownerMemberId(tripId);
  const friendIds = new Set(friends.map(friend => friend.id));

  const roster: TripMember[] = [
    {
      id: ownerId,
      name: ownerName || '我',
      userId: ownerUserId,
      type: 'owner',
    },
  ];

  const seen = new Set([ownerId]);
  companions.forEach(companion => {
    // An owner-shaped companion id would collapse onto the owner downstream.
    if (isOwnerShapedId(companion.id)) return;
    if (seen.has(companion.id)) return;
    seen.add(companion.id);

    // The seat's own account wins. `friends` is a different idea — a companion
    // whose id happens to be an account id — and it was the only way a seat
    // could be linked at all, so a seat linked by claiming an invite looked
    // exactly like a name somebody typed.
    const linkedUserId = companion.userId || (friendIds.has(companion.id) ? companion.id : undefined);
    roster.push({
      id: companion.id,
      name: companion.name,
      userId: linkedUserId,
      type: companion.type || (linkedUserId ? 'member' : 'guest'),
    });
  });

  return roster;
};

/** Companions that could not join the roster, with the reason. Debug/QA aid. */
export const findRosterRejects = ({
  companions,
}: {
  companions: Companion[];
}): Array<{ id: string; reason: 'owner-shaped' | 'duplicate' }> => {
  const rejects: Array<{ id: string; reason: 'owner-shaped' | 'duplicate' }> = [];
  const seen = new Set<string>();
  companions.forEach(companion => {
    if (isOwnerShapedId(companion.id)) {
      rejects.push({ id: companion.id, reason: 'owner-shaped' });
      return;
    }
    if (seen.has(companion.id)) {
      rejects.push({ id: companion.id, reason: 'duplicate' });
      return;
    }
    seen.add(companion.id);
  });
  return rejects;
};

export type ViewerResolutionReason =
  | 'owner-user-match'
  | 'member-user-match'
  | 'member-id-match'
  | 'owner-fallback';

export interface ViewerResolution {
  memberId: string;
  reason: ViewerResolutionReason;
  /** True when the viewer was identified, rather than assumed to be the owner. */
  isResolved: boolean;
}

/**
 * Resolve the signed-in user to a TripMember on this trip.
 *
 * Matching order, most explicit first:
 *  1. The owner's linked `userId`.
 *  2. Any member's linked `userId`.
 *  3. A member whose *id* is the auth user id — the shape produced when a trip
 *     is joined by scanning a share code, where the companion id is the
 *     joiner's user id.
 *
 * When none match (signed out, anonymous, or a roster with no link to this
 * account) the viewer falls back to the owner, which preserves today's
 * single-user behavior exactly. The fallback is reported rather than hidden, so
 * callers can tell a real identity from an assumed one.
 */
export const resolveViewer = ({
  roster,
  authUserId,
  tripOwnerMemberId,
}: {
  roster: TripMember[];
  authUserId?: string;
  tripOwnerMemberId: string;
}): ViewerResolution => {
  const fallback: ViewerResolution = {
    memberId: tripOwnerMemberId,
    reason: 'owner-fallback',
    isResolved: false,
  };

  if (!authUserId || !authUserId.trim()) return fallback;

  const owner = roster.find(member => member.type === 'owner');
  if (owner && owner.userId === authUserId) {
    return {
      memberId: normalizeOwnerMemberId(owner.id, tripOwnerMemberId),
      reason: 'owner-user-match',
      isResolved: true,
    };
  }

  const linked = roster.find(
    member => member.type !== 'owner' && member.userId === authUserId,
  );
  if (linked) {
    return { memberId: linked.id, reason: 'member-user-match', isResolved: true };
  }

  const byId = roster.find(
    member => member.type !== 'owner' && member.id === authUserId,
  );
  if (byId) {
    return { memberId: byId.id, reason: 'member-id-match', isResolved: true };
  }

  return fallback;
};

/** Convenience wrapper when only the id is needed. */
export const resolveViewerMemberId = (
  input: Parameters<typeof resolveViewer>[0],
): string => resolveViewer(input).memberId;

/**
 * Collapse any historical encoding of a member id onto the active roster.
 *
 * Legacy `me` and owner ids minted from a different trip/draft id both refer to
 * this trip's owner. Anything else is returned unchanged.
 */
export const canonicalizeMemberId = (
  id: string,
  tripOwnerMemberId: string,
): string => normalizeOwnerMemberId(id, tripOwnerMemberId);

/** Look up a display name for a member id, for UI that names people. */
export const memberNameById = (
  roster: TripMember[],
  memberId: string,
  fallbackName = '其他旅伴',
): string => roster.find(member => member.id === memberId)?.name || fallbackName;
