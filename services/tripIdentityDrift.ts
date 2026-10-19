/**
 * Trips whose name or dates on this device disagree with the cloud's.
 *
 * 「我的釜山不見了」.
 *
 * It was not deleted. A bug I wrote pointed `activeDraftId` at 釜山 without
 * loading it, and the standing persistence effect wrote the screen — which was
 * still 東京 — into that row. Name, destination and dates included. So on the
 * shelf there were two 東京 and no 釜山, and nothing on screen said why.
 *
 * The cloud still knows. `ensureTripRow` inserts a trip's name, destination and
 * dates and then never updates them, so the `trips` row is the name the trip was
 * created under. For a trip whose identity was overwritten locally, that row is
 * the only surviving copy.
 *
 * Which is also why this never restores anything on its own. The same
 * insert-only behaviour means a rename the traveller *meant* never reaches the
 * cloud either, so a mismatch has two possible causes and the data cannot tell
 * them apart. Both names are shown and the traveller decides. A screen that
 * silently picked one would be wrong about every trip he has ever renamed.
 */

export interface DraftIdentity {
  id: string;
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export interface CloudIdentity {
  id: string;
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export interface IdentityDrift {
  id: string;
  /** What this device calls it now. */
  localName: string;
  /** What the cloud row has called it since it was created. */
  cloudName: string;
  cloudDestination?: string;
  cloudStartDate?: string;
  cloudEndDate?: string;
}

const text = (value?: string): string => (value || '').trim();

/**
 * Where the two disagree, by id.
 *
 * Only the name is compared. Dates drift for ordinary reasons — a trip gets
 * extended by a day and that never pushes — and reporting those would bury the
 * one case worth reading in a list of trips that are perfectly fine. A trip
 * wearing another trip's name is a different kind of wrong: the traveller
 * cannot find it.
 *
 * An empty cloud name reports nothing: 「未命名旅程」 is what `fetchMyTrips`
 * substitutes when the column is null, and offering to restore a placeholder
 * over a name he typed would lose the only real one of the two.
 */
export const identityDrift = (
  drafts: DraftIdentity[],
  cloud: CloudIdentity[],
): IdentityDrift[] => {
  const byId = new Map(cloud.map(trip => [trip.id, trip]));

  return drafts.flatMap(draft => {
    const remote = byId.get(draft.id);
    if (!remote) return [];
    const cloudName = text(remote.name);
    const localName = text(draft.name);
    if (!cloudName || cloudName === '未命名旅程') return [];
    if (!localName || localName === cloudName) return [];
    return [{
      id: draft.id,
      localName,
      cloudName,
      ...(text(remote.destination) ? { cloudDestination: text(remote.destination) } : {}),
      ...(text(remote.startDate) ? { cloudStartDate: text(remote.startDate) } : {}),
      ...(text(remote.endDate) ? { cloudEndDate: text(remote.endDate) } : {}),
    }];
  });
};

/**
 * The drift worth interrupting somebody over: two trips on the shelf under one
 * name, while the cloud says one of them is called something else.
 *
 * A plain rename produces one drifted trip with a name nothing else uses, and
 * that is just a rename. The overwrite produces a collision, because the row
 * took its name *from* the trip beside it.
 */
export const driftLooksLikeAnOverwrite = (
  drift: IdentityDrift,
  drafts: DraftIdentity[],
): boolean =>
  drafts.filter(draft => text(draft.name) === drift.localName).length > 1;
