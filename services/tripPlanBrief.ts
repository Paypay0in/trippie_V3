/**
 * What the traveller tells Trippie before a trip exists.
 *
 * The AI planner has only ever worked from places already saved to a trip —
 * it counts them, and its button is disabled at zero. That is planning for
 * somebody who has already started. The brief is the other end: no trip, no
 * collection, just how many people, where, how long, and how they get around.
 *
 * It replaces one paragraph with a form, and the reason is not tidiness. The
 * paragraph asked people to write 「每天 11 點後再出門，有租車，不想排太滿」 and
 * then hoped a model noticed all three. A start time, a way of travelling and
 * a density are answers to fixed questions; asked as fields they arrive
 * whole, and 補充描述 keeps the paragraph for everything that is genuinely
 * prose.
 */

export type TravelPace = 2 | 3 | 4;
export type BriefTransport = 'walk' | 'drive' | 'transit';

export interface TripPlanBrief {
  /** Including the person filling this in, so never below one. */
  travellers: number;
  /** Free text — 「日本 東京」, 「韓國 釜山」 — resolved later, not here. */
  destination: string;
  startDate?: string;
  endDate?: string;
  /**
   * Set when the traveller ticked 「尚未確定日期，我只知道大約天數」.
   *
   * It does not invent dates. A trip with made-up dates looks identical to a
   * planned one on every screen that reads them — the day tabs, the ledger's
   * phases, the refund windows — and the traveller never told us those days.
   * The count goes to the model; the trip is created without dates, which the
   * app already handles by falling back to what has been recorded.
   */
  approximateDays?: number;
  transport: BriefTransport[];
  /** HH:mm the traveller wants each day to begin. */
  dayStartTime: string;
  /** Stops per day: the design's 輕旅行 / 中度 / 緊湊. */
  pace: TravelPace;
  /** 補充描述 — the old free-text box, kept for what is genuinely prose. */
  notes?: string;
}

export const DEFAULT_BRIEF: TripPlanBrief = {
  travellers: 2,
  destination: '',
  transport: ['walk', 'transit'],
  dayStartTime: '09:00',
  pace: 3,
};

export const PACE_LABEL: Record<TravelPace, { title: string; hint: string }> = {
  2: { title: '2 個行程', hint: '輕旅行・悠閒' },
  3: { title: '3 個行程', hint: '中度旅行・剛好' },
  4: { title: '4 個行程', hint: '緊湊・充實' },
};

export const TRANSPORT_LABEL: Record<BriefTransport, string> = {
  walk: '步行',
  drive: '開車',
  transit: '大眾運輸',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Nights plus one: 10/02–10/07 is six days, which is what the card says. */
export const daysBetween = (startDate?: string, endDate?: string): number | null => {
  if (!startDate || !endDate || !ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
};

/** How long the trip is, by whichever of the two the traveller gave. */
export const briefDayCount = (brief: TripPlanBrief): number | null =>
  daysBetween(brief.startDate, brief.endDate) ?? brief.approximateDays ?? null;

/**
 * What is still missing, in the traveller's words.
 *
 * Returned as a list rather than a boolean so the form can say which field,
 * and empty means ready. Only two things are actually required: where, and
 * how long. Everything else has a sensible default already on screen, and
 * demanding answers to questions that have defaults is how a form stops being
 * filled in.
 */
export const briefProblems = (brief: TripPlanBrief): string[] => {
  const problems: string[] = [];
  if (!brief.destination.trim()) problems.push('還沒填要去哪裡');

  const days = briefDayCount(brief);
  if (days === null) problems.push('還沒填日期或天數');
  else if (days < 1) problems.push('天數至少要 1 天');
  else if (days > 60) problems.push('一次最多規劃 60 天');

  if (brief.travellers < 1) problems.push('人數至少 1 人');
  return problems;
};

export const briefIsReady = (brief: TripPlanBrief): boolean => briefProblems(brief).length === 0;

/**
 * The trip to create, using the path trips are already created by.
 *
 * Dates are passed through exactly as given and never derived from
 * `approximateDays`. Companions are not invented either: 「2 人」 is a fact
 * about the plan, not two people with names, and inventing a traveller called
 * 「旅伴 1」 puts a stranger into the ledger's split.
 */
export const briefToTripSetup = (brief: TripPlanBrief): {
  destination: string;
  startDate: string;
  endDate: string;
} => ({
  destination: brief.destination.trim(),
  startDate: brief.startDate || '',
  endDate: brief.endDate || '',
});

/**
 * The brief as the model receives it.
 *
 * Kept as data rather than a sentence, so the second half of this work —
 * making the planner actually honour the start time, the pace and the way of
 * travelling — has something to read that cannot be misread.
 */
export const briefToRequest = (brief: TripPlanBrief): {
  destination: string;
  travellers: number;
  days: number | null;
  startDate?: string;
  endDate?: string;
  transport: BriefTransport[];
  dayStartTime: string;
  stopsPerDay: TravelPace;
  notes?: string;
} => ({
  destination: brief.destination.trim(),
  travellers: brief.travellers,
  days: briefDayCount(brief),
  startDate: brief.startDate || undefined,
  endDate: brief.endDate || undefined,
  transport: brief.transport,
  dayStartTime: brief.dayStartTime,
  stopsPerDay: brief.pace,
  notes: brief.notes?.trim() || undefined,
});
