import i18n from '../i18n/config';
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
  | { kind: 'inspiration'; slices: ItinerarySlice[] };

export interface ScreenshotInput {
  base64Data: string;
  mimeType?: string;
  destination?: string;
  destinationCountry?: string;
  /**
   * What this picture is, when the traveller already said.
   *
   * Classifying costs a whole model call, and on a throttled key that call
   * is the difference between twenty seconds and a minute — measured on the
   * deployed service, where three classifications of the same image took
   * 10.5s, 23.9s and 57.4s as the rate limit tightened.
   *
   * The gate has already named what it wants（「先補上航班資訊與住宿資訊」）, so
   * somebody pressing 訂房 there has answered the question the model was
   * about to be paid to answer. Omit it and it is worked out as before.
   */
  assumeKind?: ScreenshotKind;
  /**
   * Told which half is running, so the wait can say so.
   *
   * Reading one screenshot is two calls and takes the better part of a
   * minute. A single 「讀取截圖中…」 for all of it is indistinguishable from a
   * screen that has stopped, which is how 「讀取很久」 gets reported as a bug.
   */
  onStage?: (stage: 'classifying' | 'reading') => void;
}

/**
 * The server words its own failures for the traveller — busy, unreadable,
 * nothing usable in the picture — so they are surfaced as written. A generic
 * replacement would hide the only thing they need: whether retrying helps.
 */
/**
 * How long one call may take before the traveller is told it will not finish.
 *
 * Measured, not guessed. The first number here was sixty seconds, chosen
 * because it sounded generous — and then the Founder's own LINE screenshot,
 * run against the deployed service, came back correct in 51 seconds for the
 * parse alone and 7 for the classification. It was succeeding two seconds
 * inside a limit I had invented.
 *
 * A parse walks a ladder of models, and each rung that answers 503 costs a
 * retry and a backoff before the next is tried, so a slow day is several
 * real requests deep. Two minutes is well past the worst measured case and
 * still finite: the alternative is a spinner with no end, which is what
 * 「讀取很久」 was.
 */
const CALL_TIMEOUT_MS = 120_000;

const post = async (endpoint: string, body: unknown, fallback: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (error) {
    // Separated because the answers differ: one is worth retrying now, the
    // other is worth retrying with a smaller or clearer picture.
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(i18n.t('plan.screenshotIntake.timeout'));
    }
    throw new Error(i18n.t('plan.screenshotIntake.offline'));
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
    i18n.t('plan.screenshotIntake.unreadable'),
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
const refusal = (): string => i18n.t('plan.screenshotIntake.partialBooking');

export const readScreenshot = async (input: ScreenshotInput): Promise<ScreenshotResult> => {
  /*
    One call instead of two when the traveller already said what it is.
    See `assumeKind`.
  */
  let kind = input.assumeKind;
  if (!kind) {
    input.onStage?.('classifying');
    kind = await classifyScreenshot(input);
  }
  input.onStage?.('reading');
  const route = routeFor(kind);
  const picture = { base64Data: input.base64Data, mimeType: input.mimeType };

  if (kind === 'rental') {
    const rental = normalizeParsedRental(await post(route.endpoint, picture, i18n.t('plan.screenshotIntake.rentalUnreadable')));
    if (!rental) throw new Error(refusal());
    return { kind, rental };
  }

  if (kind === 'stay') {
    const stay = normalizeParsedStay(await post(route.endpoint, picture, i18n.t('plan.screenshotIntake.stayUnreadable')));
    if (!stay) throw new Error(refusal());
    return { kind, stay };
  }

  if (kind === 'flight') {
    // The flight route answers with a {OUTBOUND?, RETURN?} envelope rather
    // than one flight, and its own sheet is what knows how to place the two
    // legs on the trip. Handed over whole, unread.
    return { kind, flights: await post(route.endpoint, picture, i18n.t('plan.screenshotIntake.flightReadFailed')) };
  }

  const slices = normalizeItinerarySlices(await post(
    route.endpoint,
    { ...picture, destination: input.destination, destinationCountry: input.destinationCountry },
    i18n.t('plan.screenshotIntake.unreadable'),
  ));
  if (slices.length === 0) throw new Error(i18n.t('plan.screenshotIntake.nothingToPlanOne'));
  return { kind: 'inspiration', slices };
};
