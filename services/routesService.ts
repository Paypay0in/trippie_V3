export type RouteEstimate = {
  distanceMeters: number;
  durationSeconds: number;
};

export type RouteCoordinates = { latitude: number; longitude: number };

/** How a leg may be travelled. Transit is the default; see `fetchRouteLeg`. */
export type TravelMode = 'TRANSIT' | 'DRIVE' | 'WALK';

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  TRANSIT: '大眾運輸',
  DRIVE: '開車',
  WALK: '步行',
};

export interface RouteLegStep {
  travelMode: string;
  durationSeconds?: number;
  /** The line's own short name, e.g. 「1003」 or 「2호선」. */
  lineName?: string;
  departureStop?: string;
  arrivalStop?: string;
  stopCount?: number;
}

export interface RouteLeg {
  mode: TravelMode;
  /**
   * False when the provider publishes no route of this mode here. South Korea
   * has no Google driving or walking routes, so this is an ordinary answer
   * rather than a failure, and the traveller is told which mode was refused.
   */
  available: boolean;
  durationSeconds?: number;
  distanceMeters?: number;
  steps?: RouteLegStep[];
}

/**
 * One leg between two consecutive places, in the mode the traveller asked for.
 *
 * Deliberately never falls back to another mode on its own: a walking number
 * shown where a traveller asked about driving is worse than no number.
 */
export async function fetchRouteLeg(
  origin: RouteCoordinates,
  destination: RouteCoordinates,
  mode: TravelMode = 'TRANSIT',
  departureTime?: string,
): Promise<RouteLeg> {
  const response = await fetch('/api/routes/leg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      mode,
      departureTime,
    }),
  });
  const body = await response.json().catch(() => null) as (RouteLeg & { error?: string }) | null;
  if (!response.ok || !body || typeof body.available !== 'boolean') {
    throw new Error(typeof body?.error === 'string' ? body.error : '路線服務暫時無法使用。');
  }
  return { mode, available: body.available, durationSeconds: body.durationSeconds, distanceMeters: body.distanceMeters, steps: body.steps };
}

export async function estimateRoute(origin: RouteCoordinates, destination: RouteCoordinates): Promise<RouteEstimate> {
  const response = await fetch('/api/routes/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentLatitude: origin.latitude,
      currentLongitude: origin.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
    }),
  });
  const body = await response.json().catch(() => null) as { distanceMeters?: unknown; durationSeconds?: unknown; error?: unknown } | null;
  if (!response.ok || typeof body?.distanceMeters !== 'number' || typeof body?.durationSeconds !== 'number') {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Route estimate unavailable');
  }
  return { distanceMeters: body.distanceMeters, durationSeconds: body.durationSeconds };
}
