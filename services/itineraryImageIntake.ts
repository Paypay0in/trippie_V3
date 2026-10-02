import { ItinerarySlice, normalizeItinerarySlices } from './itineraryImageSlices';

/**
 * Sends a screenshot to the parser and returns the slices it found.
 *
 * The server phrases its own failures for the traveller — busy, unreadable,
 * nothing usable in the picture — so those are surfaced as written rather than
 * replaced with a generic message that hides whether retrying is worth it.
 */
export const readItinerarySlicesFromImage = async (input: {
  base64Data: string;
  mimeType?: string;
  destination?: string;
  destinationCountry?: string;
}): Promise<ItinerarySlice[]> => {
  let response: Response;
  try {
    response = await fetch('/api/itinerary/parse-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('現在無法辨識截圖，請確認連線後再試。');
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '現在無法辨識截圖，請稍後再試。');
  }
  return normalizeItinerarySlices(payload);
};
