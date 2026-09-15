/**
 * `resolvedPlaceName` and `photoAvailable` are only set by the Google Places branch
 * of /api/places/resolve. The geocoding fallbacks return coordinates and sometimes a
 * numeric id that is NOT a Google place id, so callers that need a real Places
 * identity (for photos) must treat `resolvedPlaceName` as the discriminator.
 */
export type ResolvedPlace = { placeId?: string; resolvedPlaceName?: string; address?: string; country?: string; countryCode?: string; latitude: number; longitude: number; photoAvailable?: boolean };
export type PlaceSuggestion = { placeId: string; primaryText: string; secondaryText?: string; city?: string; country?: string };

export const autocompletePlaces = async (query: string, context: { latitude?: number; longitude?: number; country?: string; travelCountry?: string }, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  const response = await fetch('/api/places/autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ query: query.trim(), ...context }) });
  if (!response.ok) return [];
  return (await response.json() as { suggestions?: PlaceSuggestion[] }).suggestions || [];
};

export const getPlaceDetails = async (placeId: string, sessionToken: string): Promise<ResolvedPlace & { location: string }> => {
  const response = await fetch('/api/places/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId, sessionToken }) });
  if (!response.ok) throw new Error('Place details unavailable');
  return await response.json() as ResolvedPlace & { location: string };
};

export const resolvePlace = async (query: string, country?: string): Promise<ResolvedPlace | null> => {
  if (!query.trim()) return null;
  const response = await fetch('/api/places/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim(), country: country?.trim() || undefined }) });
  if (!response.ok) return null;
  return await response.json() as ResolvedPlace;
};
