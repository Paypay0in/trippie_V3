export type RouteEstimate = {
  distanceMeters: number;
  durationSeconds: number;
};

export type RouteCoordinates = { latitude: number; longitude: number };

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
