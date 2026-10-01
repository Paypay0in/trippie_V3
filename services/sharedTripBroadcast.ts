/**
 * Socket payload helpers for anonymous sharing.
 *
 * Signed-in sharing strips the cloud-owned lists elsewhere. These helpers only
 * make the anonymous payload complete and distinguish an omitted field from an
 * intentionally empty list, which is how deleting the last itinerary item
 * reaches the other client.
 */

export const createSharedTripBroadcastState = <T extends Record<string, unknown>>(state: T): T =>
  ({ ...state });

export const optionalBroadcastList = <T>(value: unknown): T[] | undefined =>
  Array.isArray(value) ? value as T[] : undefined;
