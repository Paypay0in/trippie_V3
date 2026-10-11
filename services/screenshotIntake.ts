import { ParsedRental, normalizeParsedRental } from './rentalIntake';
import { ParsedStay, normalizeParsedStay } from './stayIntake';
import { ItinerarySlice, normalizeItinerarySlices } from './itineraryImageSlices';
import { ScreenshotKind, normalizeScreenshotKind, routeFor } from './screenshotKind';

/**
 * One screenshot in, whatever it turned out to be out.
 *
 * 「新增一個上傳截圖的入口」 — the traveller has a picture and does not want to
 * first decide which of five uploads it belongs to. They should not have to:
 * the app can look at it.
 *
 * Two calls rather than one. The picture is classified, then sent whole to
 * the parser already written for that document, with the prompt that was
 * tuned for it. The cheaper single call would have been one prompt reading
 * everything — and a hire read by a general-purpose prompt loses its pickup
 * and drop-off dates, which are the only part the planner needs.
 */

export type ScreenshotResult =
  | { kind: 'rental'; rental: ParsedRental }
  | { kind: 'stay'; stay: ParsedStay }
  | { kind: 'flight'; flights: unknown }
  | { kind: 'inspiration'; slices: ItinerarySlice[] }
  /**
   * Classified, deliberately not parsed.
   *
   * A caller that cannot act on a kind says so up front, and then the second
   * call is never made. Parsing a booking only to refuse it spends a model
   * call on an answer nobody reads, and leaves the traveller waiting for it.
   */
  | { kind: ScreenshotKind; elsewhere: true };

export interface ScreenshotInput {
  base64Data: string;
  mimeType?: string;
  destination?: string;
  destinationCountry?: string;
  /** Kinds this caller can act on. Omit to accept all four. */
  handles?: readonly ScreenshotKind[];
}

/**
 * The server words its own failures for the traveller — busy, unreadable,
 * nothing usable in the picture — so they are surfaced as written. A generic
 * replacement would hide the only thing they need: whether retrying helps.
 */
const post = async (endpoint: string, body: unknown, fallback: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('現在無法辨識截圖，請確認連線後再試。');
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : fallback);
  }
  return payload;
};

export const classifyScreenshot = async (input: ScreenshotInput): Promise<ScreenshotKind> => {
  const payload = await post(
    '/api/screenshots/kind',
    { base64Data: input.base64Data, mimeType: input.mimeType },
    '現在無法辨識截圖，請稍後再試。',
  ) as { kind?: unknown } | null;
  return normalizeScreenshotKind(payload?.kind);
};

/**
 * A booking that could not be read is not reported as an empty booking.
 *
 * `normalizeParsedRental` returns null for a hire with no company, and the
 * same for a stay with no name — the refusal both parsers make on purpose. An
 * empty card the traveller fills in is recoverable; a confidently wrong one
 * is not, and that is the whole reason those two return null at all.
 */
const refusal = '這張截圖讀不出完整的訂單，請改用該區塊的上傳按鈕手動確認。';

export const readScreenshot = async (input: ScreenshotInput): Promise<ScreenshotResult> => {
  const kind = await classifyScreenshot(input);
  if (input.handles && !input.handles.includes(kind)) return { kind, elsewhere: true };
  const route = routeFor(kind);
  const picture = { base64Data: input.base64Data, mimeType: input.mimeType };

  if (kind === 'rental') {
    const rental = normalizeParsedRental(await post(route.endpoint, picture, '現在無法辨識租車訂單，請手動輸入。'));
    if (!rental) throw new Error(refusal);
    return { kind, rental };
  }

  if (kind === 'stay') {
    const stay = normalizeParsedStay(await post(route.endpoint, picture, '現在無法辨識訂房截圖，請手動輸入。'));
    if (!stay) throw new Error(refusal);
    return { kind, stay };
  }

  if (kind === 'flight') {
    // The flight route answers with a {OUTBOUND?, RETURN?} envelope rather
    // than one flight, and its own sheet is what knows how to place the two
    // legs on the trip. Handed over whole, unread.
    return { kind, flights: await post(route.endpoint, picture, '現在無法辨識機票，請手動輸入。') };
  }

  const slices = normalizeItinerarySlices(await post(
    route.endpoint,
    { ...picture, destination: input.destination, destinationCountry: input.destinationCountry },
    '現在無法辨識截圖，請稍後再試。',
  ));
  if (slices.length === 0) throw new Error('這張截圖看不出可以排進行程的地點，換一張再試試。');
  return { kind: 'inspiration', slices };
};
