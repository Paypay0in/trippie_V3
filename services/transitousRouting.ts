/**
 * Transit times for the places Google will not answer for.
 *
 * 「但能不能查大眾運輸的時間」.
 *
 * `transitCoverage` records what was measured: the Routes API returns nothing
 * at all for Japanese transit while answering normally for every neighbouring
 * country on the same key. The consumer Google Maps app has the timetables
 * under agreements that service does not carry, so until now the honest answer
 * on a Japan trip was a sentence and a link.
 *
 * Transitous is a community-run, provider-neutral routing service built on the
 * MOTIS engine over openly published GTFS feeds. Free, no key, no quota.
 * Measured against it, 2026-10-18:
 *
 *   新宿 → 浅草      34 分・轉乘 2 次・JC 中央線快速 → JR → TX
 *   海雲台 → 札嘎其   73 分・1003 路
 *
 * Second opinion only. Google answers first wherever it can, because its data
 * is better maintained and its coverage wider; this is asked when Google has
 * said 「not here」, and a rough estimate still waits behind it. Three layers,
 * each more accurate than the one below.
 *
 * OFF BY DEFAULT, and the reason is not technical. Their usage policy asks
 * that consumers be open-source and non-commercial, and Trippie is neither.
 * The route works — it was measured — but whether to use it is a licensing
 * decision, so it is gated behind `TRANSITOUS_ENABLED` and nothing calls the
 * service until that is deliberately set. The policy also requires a
 * contactable User-Agent on every request, which `USER_AGENT` carries.
 */

/** Where the itinerary's own leg shape is defined. Kept structural on purpose:
 *  this module runs on the server and must not drag the client's types in. */
export interface TransitousLeg {
  durationSeconds: number;
  steps: Array<{
    travelMode: string;
    durationSeconds?: number;
    lineName?: string;
    departureStop?: string;
    arrivalStop?: string;
  }>;
}

export const TRANSITOUS_PLAN_URL = 'https://api.transitous.org/api/v1/plan';

/**
 * Required by their policy: the application, its version, and a way to reach
 * whoever is making the requests. A generic agent is refused with a 403 and a
 * pointer to the policy — which is how this requirement was found.
 */
export const USER_AGENT = 'Trippie/3.0 (https://trippie-v3.onrender.com)';

/** Whether the open fallback may be called at all. See the note above. */
export const transitousEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.TRANSITOUS_ENABLED === 'true';

interface Point { latitude: number; longitude: number }

/**
 * MOTIS mode names, folded to the two this app draws.
 *
 * Everything that is not walking is 「a ride」 as far as the card is concerned:
 * it prints a line name and a duration, and TRAM vs REGIONAL_RAIL changes
 * nothing about that. Folding here keeps the distinction out of the UI, which
 * already has one vocabulary for this and does not need a second.
 */
const travelModeOf = (mode: unknown): string =>
  (typeof mode === 'string' && mode.toUpperCase() === 'WALK' ? 'WALK' : 'TRANSIT');

/**
 * A line's name, preferring the short code.
 *
 * 「JC」 and 「TX」 are what the signs in the station say and what fits on the
 * card. Some feeds give only an internal id — 「9459821」 — which is worse than
 * nothing to read, so a name that is nothing but digits is dropped.
 */
const lineNameOf = (leg: Record<string, unknown>): string | undefined => {
  const short = typeof leg.routeShortName === 'string' ? leg.routeShortName.trim() : '';
  const long = typeof leg.routeLongName === 'string' ? leg.routeLongName.trim() : '';
  const name = short && !/^\d+$/.test(short) ? short : long && !/^\d+$/.test(long) ? long : '';
  return name || undefined;
};

const placeNameOf = (place: unknown): string | undefined => {
  const name = typeof (place as { name?: unknown })?.name === 'string' ? (place as { name: string }).name.trim() : '';
  // MOTIS names the request's own endpoints 「START」 and 「END」; those are not
  // stops and printing them would put the word START on a travel card.
  return !name || name === 'START' || name === 'END' ? undefined : name;
};

/** Parses one MOTIS itinerary into the shape the leg card already renders. */
export const legFromItinerary = (itinerary: unknown): TransitousLeg | undefined => {
  const source = itinerary as { duration?: unknown; legs?: unknown };
  const durationSeconds = Number(source?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;

  const legs = Array.isArray(source.legs) ? source.legs : [];
  const steps = legs.map(entry => {
    const leg = (entry || {}) as Record<string, unknown>;
    const seconds = Number(leg.duration);
    return {
      travelMode: travelModeOf(leg.mode),
      durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : undefined,
      lineName: lineNameOf(leg),
      departureStop: placeNameOf(leg.from),
      arrivalStop: placeNameOf(leg.to),
    };
  }).filter(step => step.durationSeconds !== undefined);

  return { durationSeconds: Math.round(durationSeconds), steps };
};

/**
 * The fastest itinerary MOTIS returns, or nothing.
 *
 * Never throws and never takes long. This runs after a lookup that already
 * failed, on a service with no SLA, so every way it can go wrong resolves to
 * 「no answer」 and the caller falls through to the estimate it had before.
 */
export const fetchTransitousLeg = async (
  from: Point,
  to: Point,
  departureTime?: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<TransitousLeg | undefined> => {
  const call = options?.fetchImpl ?? fetch;
  const query = new URLSearchParams({
    fromPlace: `${from.latitude},${from.longitude}`,
    toPlace: `${to.latitude},${to.longitude}`,
  });
  // A departure in the past asks for yesterday's timetable; the server already
  // only forwards times still ahead of now.
  if (departureTime && !Number.isNaN(Date.parse(departureTime))) {
    query.set('time', new Date(departureTime).toISOString());
  }

  try {
    const response = await call(`${TRANSITOUS_PLAN_URL}?${query.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(options?.timeoutMs ?? 8_000),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as { itineraries?: unknown };
    const itineraries = Array.isArray(data?.itineraries) ? data.itineraries : [];

    /*
      The quickest, not the first. MOTIS returns a spread of departures and the
      order is not a ranking, so taking [0] would sometimes print 73 minutes
      beside a 34-minute alternative it also found.
    */
    return itineraries
      .map(legFromItinerary)
      .filter((leg): leg is TransitousLeg => leg !== undefined)
      .sort((left, right) => left.durationSeconds - right.durationSeconds)[0];
  } catch {
    return undefined;
  }
};
