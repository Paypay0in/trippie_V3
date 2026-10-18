/**
 * What is known about a place the traveller saved nothing about.
 *
 * 「這個你要基本查一些資訊 不能讓這個行程空白」. A screenshot that named 다고소님 and
 * nothing else produced a card with a name and an empty space beneath it. An
 * empty space says nothing about the place and reads like a failure.
 *
 * Every field here comes back from Google about that exact place id — its kind,
 * its own one-line description, its hours, its rating. None of it is written by
 * a model: a plausible sentence about a restaurant nobody checked is worse than
 * the blank it replaced, because it cannot be told apart from one that is true.
 *
 * Mirrors placePhotoService: one request per place, cached, and every failure
 * resolves to null. This is enrichment — it must never block a card from
 * rendering or a list from loading.
 */

export interface PlaceBasics {
  /** 「咖啡廳」, 「韓式料理」 — Google's own category for the place. */
  kind?: string;
  /**
   * The same category as a stable enum（`restaurant`, `train_station`）.
   *
   * 「每個收藏給個標籤🏷️景點、餐廳、等等」 — `kind` is localized prose and reads
   * differently in every language, so a tag folded out of it would be folding
   * a sentence. See `placeCategory`.
   */
  primaryType?: string;
  /** Google's one-line description, where it has one. */
  summary?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  openNow?: boolean;
  /** Seven lines, Monday first, as Google phrases them. */
  weekdayHours?: string[];
  website?: string;
}

const cache = new Map<string, PlaceBasics | null>();
const pending = new Map<string, Promise<PlaceBasics | null>>();

/** Exposed for tests; the app never needs to clear the cache. */
export const clearPlaceBasicsCache = () => { cache.clear(); pending.clear(); };

const text = (value: unknown): string | undefined =>
  (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const positive = (value: unknown): number | undefined =>
  (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);

/**
 * Keeps only what can be shown as a fact.
 *
 * A rating with no count behind it is dropped: 「★5.0」 from one review is a
 * number that misleads more than it informs.
 */
export const normalizePlaceBasics = (value: unknown): PlaceBasics | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const ratingCount = positive(source.ratingCount);

  const basics: PlaceBasics = {
    kind: text(source.kind),
    primaryType: text(source.primaryType),
    summary: text(source.summary),
    rating: ratingCount ? positive(source.rating) : undefined,
    ratingCount,
    priceLevel: text(source.priceLevel),
    businessStatus: text(source.businessStatus),
    openNow: typeof source.openNow === 'boolean' ? source.openNow : undefined,
    weekdayHours: Array.isArray(source.weekdayHours)
      ? (source.weekdayHours as unknown[]).filter((line): line is string => typeof line === 'string' && Boolean(line.trim()))
      : undefined,
    website: text(source.website),
  };

  return Object.values(basics).some(entry => entry !== undefined && (!Array.isArray(entry) || entry.length > 0))
    ? basics
    : null;
};

export const fetchPlaceBasics = async (placeId?: string): Promise<PlaceBasics | null> => {
  const id = placeId?.trim();
  // Without a resolved place there is nothing to look up: a name alone could be
  // any of several branches, and guessing which would be worse than the blank.
  if (!id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const response = await fetch('/api/places/basics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: id }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { basics?: unknown };
      return normalizePlaceBasics(payload?.basics);
    } catch {
      return null;
    }
  })();

  pending.set(id, request);
  const result = await request;
  pending.delete(id);
  cache.set(id, result);
  return result;
};

const PRICE_LABELS: Record<string, string> = {
  PRICE_LEVEL_FREE: '免費',
  PRICE_LEVEL_INEXPENSIVE: '平價',
  PRICE_LEVEL_MODERATE: '中價位',
  PRICE_LEVEL_EXPENSIVE: '高價位',
  PRICE_LEVEL_VERY_EXPENSIVE: '高級',
};

/**
 * The one line a list row can carry.
 *
 * Kind first, because 「這是什麼」 is the question an unfamiliar Korean name
 * leaves open. Hours are left out: a row is read while scrolling, and 「今天幾點
 * 關」 is a question for the card, where there is room to be exact.
 */
export const summarizePlaceBasics = (basics: PlaceBasics | null): string => {
  if (!basics) return '';
  if (basics.businessStatus === 'CLOSED_PERMANENTLY') return '已永久歇業';

  const parts = [
    basics.kind,
    basics.rating && basics.ratingCount ? `★ ${basics.rating.toFixed(1)}（${basics.ratingCount.toLocaleString()}）` : '',
    basics.priceLevel ? PRICE_LABELS[basics.priceLevel] || '' : '',
  ].filter(Boolean);

  return parts.join(' · ');
};

/** Today's hours, as Google phrases them. Monday is index 0 in their list. */
export const hoursForToday = (basics: PlaceBasics | null, now: Date = new Date()): string | undefined => {
  const lines = basics?.weekdayHours;
  if (!lines || lines.length < 7) return undefined;
  // getDay() is Sunday-first; Google's list is Monday-first.
  const index = (now.getDay() + 6) % 7;
  return lines[index];
};

/**
 * The hours for a particular date, rather than for today.
 *
 * 「像這個開放時間也都要寫成行程表上」. `hoursForToday` has printed this on the
 * saved-place card for months, and the itinerary card — the one screen that
 * knows which *day* each stop is on — only ever showed the rating.
 *
 * Today is the wrong question there. A museum open today and shut on the
 * Monday he has it planned for is exactly the case worth catching, and
 * 「今天 10:00–18:00」 beside a Monday stop is a reassuring lie.
 *
 * @param isoDate a plain `YYYY-MM-DD`, read as a local date — these are trip
 *   dates, not instants, and `new Date('2026-10-26')` would be parsed as UTC
 *   and come out a day early west of Greenwich.
 */
export const hoursForDate = (basics: PlaceBasics | null, isoDate?: string): string | undefined => {
  const lines = basics?.weekdayHours;
  if (!lines || lines.length < 7 || !isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  // getDay() is Sunday-first; Google's list is Monday-first.
  return lines[(date.getDay() + 6) % 7];
};

/**
 * Whether that line means the place is shut.
 *
 * Matched on the words Google actually returns, in the languages this app
 * asks in. Anything unrecognised is treated as open: printing 「公休」 over a
 * day somebody can visit is the more expensive mistake, because they will
 * cancel the stop rather than check.
 */
export const readsAsClosed = (line?: string): boolean =>
  Boolean(line && /closed|休息|公休|定休|休館|休業|휴무/i.test(line));

/**
 * The opening window on a line like 「Tuesday: 10:00 – 18:00」.
 *
 * Returns nothing whenever the line cannot be read with confidence — a
 * multi-window day (「11:30–14:00, 17:00–22:00」), 24-hour opening, or wording
 * this does not know. A half-understood line is how a place gets reported shut
 * during the hours it is open.
 */
export const openingWindow = (line?: string): { from: number; to: number } | undefined => {
  if (!line || readsAsClosed(line)) return undefined;
  const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
  // Two times and exactly two: a split shift has four and is not one window.
  const times = Array.from(body.matchAll(/(\d{1,2})[:：](\d{2})\s*(AM|PM|am|pm)?/g));
  if (times.length !== 2) return undefined;

  const minutes = times.map(match => {
    let hour = Number(match[1]);
    const suffix = (match[3] || '').toUpperCase();
    if (suffix === 'PM' && hour < 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;
    return hour * 60 + Number(match[2]);
  });

  const [from, to] = minutes;
  // Past midnight — a bar open until 02:00 — is a real window this cannot
  // compare against a wall clock, so it is left alone rather than inverted.
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined;
  return { from, to };
};

/**
 * Whether a stop is planned for a time the place is not open.
 *
 * 「因此要提醒用戶」. Printing the hours puts the fact on the card; it still
 * leaves the traveller to compare two clocks, on every card, for every day.
 * That comparison is arithmetic, and arithmetic is ours.
 *
 * Deliberately reports only what it is sure of: a stop that *starts* outside
 * the window, or one that would still be running after closing. Arriving an
 * hour before closing is tight rather than wrong, and this says nothing about
 * it — a warning on an ordinary afternoon is a warning nobody reads.
 */
export const outsideOpeningHours = (
  line: string | undefined,
  startTime?: string,
  durationMinutes?: number,
): 'closed-day' | 'before-opening' | 'after-closing' | undefined => {
  if (readsAsClosed(line)) return 'closed-day';
  const window = openingWindow(line);
  if (!window || !startTime || !/^\d{2}:\d{2}$/.test(startTime)) return undefined;

  const [hours, mins] = startTime.split(':').map(Number);
  const start = hours * 60 + mins;
  if (start < window.from) return 'before-opening';

  const length = Number.isFinite(durationMinutes) && (durationMinutes as number) > 0
    ? (durationMinutes as number)
    : 0;
  if (start >= window.to || start + length > window.to) return 'after-closing';
  return undefined;
};
