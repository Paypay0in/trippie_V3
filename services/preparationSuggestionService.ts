export type PreparationSuggestion = { item: string; reason: string };

export interface SuggestedPlace {
  name: string;
  address: string;
  rating?: number;
  mapsUrl: string;
}

export interface SuggestedPlaceGroup {
  query: string;
  places: SuggestedPlace[];
}

export class PreparationSuggestionRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PreparationSuggestionRequestError';
    this.status = status;
  }
}

export interface PreparationResult {
  suggestions: PreparationSuggestion[];
  /** Map searches the model proposes; the shops themselves come from Places. */
  placeQueries: string[];
}

export const fetchPreparationSuggestions = async (context: string): Promise<PreparationResult> => {
  const response = await fetch('/api/preparation-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
    throw new PreparationSuggestionRequestError(errorPayload?.error || 'Preparation suggestion request failed', response.status);
  }
  const data = await response.json() as { suggestions?: PreparationSuggestion[]; placeQueries?: string[] };
  return {
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    placeQueries: Array.isArray(data.placeQueries) ? data.placeQueries : [],
  };
};

/**
 * Real shops for the model's search phrases.
 *
 * Never throws: a missing shop list must not take the preparation advice down
 * with it, since the advice is useful on its own.
 */
export const fetchSuggestedPlaces = async (queries: string[]): Promise<SuggestedPlaceGroup[]> => {
  if (!queries.length) return [];
  try {
    const response = await fetch('/api/places/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    });
    if (!response.ok) return [];
    const data = await response.json() as { groups?: SuggestedPlaceGroup[] };
    return Array.isArray(data.groups) ? data.groups : [];
  } catch {
    return [];
  }
};
