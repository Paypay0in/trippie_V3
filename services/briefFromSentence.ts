/**
 * One sentence, turned into the brief the planner already understands.
 *
 * 「11月去東京五天，兩個人，喜歡美術館、咖啡廳和購物，不想太趕。住宿在新宿，想去
 * teamLab。」 — that is how somebody describes a trip. The form asked them to
 * take it apart themselves: destination here, dates there, a stepper for the
 * number of people, a radio for the pace, and everything that was actually
 * prose into a box at the bottom.
 *
 * The form stays. It is where the answer is checked and corrected, and a
 * parse nobody can see is a parse nobody can disagree with. This only fills
 * it in.
 *
 * What the model may decide and what it may not is the whole of this file:
 *
 * - **It may not invent dates.** 「11 月」 is a month, not a departure. A trip
 *   carrying made-up dates is indistinguishable from a planned one on every
 *   screen that reads them — the day tabs, the ledger's phases, the refund
 *   windows — and the traveller never said those days. A month becomes a
 *   sentence in the notes, where it steers the season and nothing else.
 * - **It may not fill a silence.** A sentence that never says how many people
 *   leaves the field at its default, and the field says so; it does not get a
 *   confident 2 that reads exactly like a stated 2.
 * - **Everything it did read is shown back.** The traveller can only correct
 *   what they can see.
 */
import { BriefTransport, DEFAULT_BRIEF, TravelPace, TripPlanBrief } from './tripPlanBrief';

/** What the model is asked to pull out. Every field optional, on purpose. */
export interface SentenceParse {
  destination?: string;
  travellers?: number;
  /** Only when a real date was stated. */
  startDate?: string;
  endDate?: string;
  /** 1–12, when a month was named without a year. */
  month?: number;
  /** 「五天」. */
  days?: number;
  pace?: TravelPace;
  transport?: BriefTransport[];
  /** HH:mm, when the sentence says when they want to set off. */
  dayStartTime?: string;
  /** 美術館、咖啡廳、購物. */
  interests?: string[];
  /** 想去 teamLab. */
  mustDo?: string[];
  /** 住宿在新宿. */
  lodging?: string;
}

export interface BriefReading {
  brief: TripPlanBrief;
  /** What was understood, in the traveller's language, for showing back. */
  read: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const clean = (value?: string): string => (value || '').trim();
const cleanList = (values?: string[]): string[] =>
  (values || []).map(clean).filter(Boolean);

/**
 * The prose half of the brief, assembled from the parts that are prose.
 *
 * Kept as one paragraph rather than new fields: 「喜歡美術館、咖啡廳和購物」 and
 * 「住宿在新宿」 already reach the planner through `planningPreferences`, which
 * is a high-priority scheduling instruction. A field for each would be a
 * second place for the same sentence to live, and the planner would then have
 * to be taught about both.
 */
const notesFrom = (parse: SentenceParse, existing?: string): string => {
  const parts: string[] = [];
  const interests = cleanList(parse.interests);
  const mustDo = cleanList(parse.mustDo);
  const lodging = clean(parse.lodging);

  if (interests.length) parts.push(`喜歡${interests.join('、')}`);
  if (lodging) parts.push(`住宿在${lodging}`);
  if (mustDo.length) parts.push(`一定要去${mustDo.join('、')}`);
  /*
    The month, when that is all that was said. It never becomes a date — see
    the note at the top — but a trip in November is not the same trip in July,
    and the planner is the only thing that can act on that.
  */
  if (!parse.startDate && parse.month) parts.push(`預計 ${parse.month} 月出發`);

  const written = parts.join('。');
  const kept = clean(existing);
  if (!written) return kept;
  // Whatever the traveller had already typed survives, after the parse.
  return kept ? `${written}。${kept}` : `${written}。`;
};

/**
 * Fold a parse into a brief.
 *
 * `base` is whatever is on the form now, so reading a second sentence does
 * not wipe a field the traveller has just corrected by hand — only the fields
 * the new sentence actually speaks about move.
 */
export const briefFromSentence = (
  parse: SentenceParse,
  base: TripPlanBrief = DEFAULT_BRIEF,
): BriefReading => {
  const read: string[] = [];
  const brief: TripPlanBrief = { ...base };

  const destination = clean(parse.destination);
  if (destination) {
    brief.destination = destination;
    read.push(`目的地：${destination}`);
  }

  if (typeof parse.travellers === 'number' && parse.travellers >= 1) {
    brief.travellers = Math.min(Math.round(parse.travellers), 20);
    read.push(`${brief.travellers} 個人`);
  }

  /*
    Dates only when dates were stated. A day count is a day count: the form's
    own 「尚未確定日期」 branch exists for exactly this, and it creates the trip
    without dates rather than with imagined ones.
  */
  if (ISO_DATE.test(clean(parse.startDate))) {
    brief.startDate = clean(parse.startDate);
    brief.approximateDays = undefined;
    if (ISO_DATE.test(clean(parse.endDate))) brief.endDate = clean(parse.endDate);
    read.push(`日期：${brief.startDate}${brief.endDate ? ` – ${brief.endDate}` : ''}`);
  } else if (typeof parse.days === 'number' && parse.days >= 1) {
    brief.approximateDays = Math.min(Math.round(parse.days), 60);
    brief.startDate = undefined;
    brief.endDate = undefined;
    read.push(`${brief.approximateDays} 天（日期還沒定）`);
  }

  if (parse.pace === 2 || parse.pace === 3 || parse.pace === 4) {
    brief.pace = parse.pace;
    read.push(parse.pace === 2 ? '步調：悠閒' : parse.pace === 4 ? '步調：緊湊' : '步調：剛好');
  }

  const transport = (parse.transport || []).filter(
    (mode): mode is BriefTransport => mode === 'walk' || mode === 'drive' || mode === 'transit',
  );
  if (transport.length) {
    brief.transport = Array.from(new Set(transport));
    read.push(`交通：${brief.transport.join('、')}`);
  }

  if (CLOCK.test(clean(parse.dayStartTime))) {
    brief.dayStartTime = clean(parse.dayStartTime);
    read.push(`${brief.dayStartTime} 出門`);
  }

  const notes = notesFrom(parse, base.notes);
  if (notes !== clean(base.notes)) brief.notes = notes;

  const interests = cleanList(parse.interests);
  const mustDo = cleanList(parse.mustDo);
  const lodging = clean(parse.lodging);
  if (interests.length) read.push(`喜歡：${interests.join('、')}`);
  if (lodging) read.push(`住宿：${lodging}`);
  if (mustDo.length) read.push(`必去：${mustDo.join('、')}`);
  if (!clean(parse.startDate) && parse.month) read.push(`${parse.month} 月出發`);

  return { brief, read };
};

/**
 * What the sentence did not say, named rather than defaulted silently.
 *
 * The form fills these from `DEFAULT_BRIEF`, and a default that arrived
 * without being mentioned looks exactly like an answer. This is the line
 * underneath that says which numbers are still Trippie's guess.
 */
export const unreadFields = (parse: SentenceParse): string[] => {
  const missing: string[] = [];
  if (!clean(parse.destination)) missing.push('要去哪裡');
  if (!ISO_DATE.test(clean(parse.startDate)) && !parse.days) missing.push('幾天');
  if (typeof parse.travellers !== 'number') missing.push('幾個人');
  if (parse.pace !== 2 && parse.pace !== 3 && parse.pace !== 4) missing.push('步調');
  return missing;
};

/**
 * Ask the server to read the sentence.
 *
 * The thrown message is the server's own, because this one is shown to the
 * traveller directly — 「這句話現在讀不出來，直接填下面的表單也可以」 names the
 * way out, and a generic failure would leave somebody staring at a box that
 * looks like the only way in.
 */
export const parseSentence = async (sentence: string): Promise<SentenceParse> => {
  const response = await fetch('/api/trip-brief/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '這句話現在讀不出來。');
  }
  return (payload || {}) as SentenceParse;
};
