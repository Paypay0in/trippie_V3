/**
 * Whether the first successful cloud snapshot is authoritative locally.
 *
 * A row created by this device has no cloud contents yet: its local draft is
 * the data that must be published. Every pre-existing row is the opposite —
 * even an empty expenses or itinerary array is meaningful and must clear stale
 * local state. Looking at array lengths cannot tell those cases apart.
 */
export const shouldHydrateInitialSnapshot = (createdRemoteTrip: boolean): boolean =>
  !createdRemoteTrip;
