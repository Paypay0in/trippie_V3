import { TripDraft } from './tripPersistence';

/**
 * Deciding what a trip deletion means, separated from performing it.
 *
 * Kept pure so the rules — delete exactly one trip by its stable id, never by
 * name or index, and leave the workspace pointing at something valid — can be
 * tested without a browser, and so a future shared-trip ownership check can
 * wrap the call site without touching this logic.
 */

export interface TripDeletionPlan {
  /** The trips that survive, in their original order. */
  remainingDrafts: TripDraft[];
  /** The active id after the delete; null when nothing sensible remains. */
  nextActiveDraftId: string | null;
  /** The draft to hydrate into the workspace, when the active trip was deleted. */
  draftToHydrate?: TripDraft;
  /** True when the workspace must fall back to the empty state. */
  clearWorkspace: boolean;
  /** The trip that will be removed. Absent means the id matched nothing. */
  target?: TripDraft;
}

/**
 * Plans the deletion of one trip.
 *
 * Identity is the stable draft id and nothing else: two trips called 釜山 are
 * two different trips, and an array position is not an identity at all.
 * When the deleted trip was active we promote the most recently updated
 * survivor, so the user lands on a real trip rather than a dangling id.
 */
export const planTripDeletion = (
  drafts: TripDraft[],
  activeDraftId: string | null,
  id: string,
): TripDeletionPlan => {
  const target = drafts.find(draft => draft.id === id);
  if (!target) {
    return { remainingDrafts: drafts, nextActiveDraftId: activeDraftId, clearWorkspace: false };
  }

  const remainingDrafts = drafts.filter(draft => draft.id !== id);

  if (activeDraftId !== id) {
    // An untouched active trip keeps its id — unless that id was already stale.
    const activeSurvives = remainingDrafts.some(draft => draft.id === activeDraftId);
    return {
      remainingDrafts,
      nextActiveDraftId: activeSurvives ? activeDraftId : null,
      clearWorkspace: false,
      target,
    };
  }

  const successor = [...remainingDrafts].sort((left, right) =>
    (right.updatedAt || '').localeCompare(left.updatedAt || ''),
  )[0];

  return {
    remainingDrafts,
    nextActiveDraftId: successor ? successor.id : null,
    draftToHydrate: successor,
    clearWorkspace: !successor,
    target,
  };
};
