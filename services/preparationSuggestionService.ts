export type PreparationSuggestion = { item: string; reason: string };

export class PreparationSuggestionRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PreparationSuggestionRequestError';
    this.status = status;
  }
}

export const fetchPreparationSuggestions = async (context: string): Promise<PreparationSuggestion[]> => {
  const response = await fetch('/api/preparation-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
    throw new PreparationSuggestionRequestError(errorPayload?.error || 'Preparation suggestion request failed', response.status);
  }
  const data = await response.json() as { suggestions?: PreparationSuggestion[] };
  return Array.isArray(data.suggestions) ? data.suggestions : [];
};
