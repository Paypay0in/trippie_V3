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
import i18n from '../i18n/config';
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

  // i18n-data: notes are stored on the trip and sent to the planner as planningPreferences
  if (interests.length) parts.push(`喜歡${interests.join('、')}`);
  // i18n-data: stored planner instruction, not a label
  if (lodging) parts.push(`住宿在${lodging}`);
  // i18n-data: stored planner instruction, not a label
  if (mustDo.length) parts.push(`一定要去${mustDo.join('、')}`);
  /*
    The month, when that is all that was said. It never becomes a date — see
    the note at the top — but a trip in November is not the same trip in July,
    and the planner is the only thing that can act on that.
  */
  // i18n-data: stored planner instruction, not a label
  if (!parse.startDate && parse.month) parts.push(`預計 ${parse.month} 月出發`);

  // i18n-data: sentence punctuation of a stored planner instruction
  const written = parts.join('。');
  const kept = clean(existing);
  if (!written) return kept;
  // i18n-data: sentence punctuation of a stored planner instruction
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
    read.push(i18n.t('plan.brief.read.destination', { destination }));
  }

  if (typeof parse.travellers === 'number' && parse.travellers >= 1) {
    brief.travellers = Math.min(Math.round(parse.travellers), 20);
    read.push(i18n.t('plan.brief.read.travellers', { travellers: brief.travellers }));
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
    read.push(brief.endDate
      ? i18n.t('plan.brief.read.dateRange', { start: brief.startDate, end: brief.endDate })
      : i18n.t('plan.brief.read.startDate', { start: brief.startDate }));
  } else if (typeof parse.days === 'number' && parse.days >= 1) {
    brief.approximateDays = Math.min(Math.round(parse.days), 60);
    brief.startDate = undefined;
    brief.endDate = undefined;
    read.push(i18n.t('plan.brief.read.approxDays', { days: brief.approximateDays }));
  }

  if (parse.pace === 2 || parse.pace === 3 || parse.pace === 4) {
    brief.pace = parse.pace;
    read.push(parse.pace === 2
      ? i18n.t('plan.brief.read.paceRelaxed')
      : parse.pace === 4 ? i18n.t('plan.brief.read.paceBusy') : i18n.t('plan.brief.read.paceBalanced'));
  }

  const transport = (parse.transport || []).filter(
    (mode): mode is BriefTransport => mode === 'walk' || mode === 'drive' || mode === 'transit',
  );
  if (transport.length) {
    brief.transport = Array.from(new Set(transport));
    /*
      The chip said 「交通：walk、transit」 — the stored ids, printed raw. It was
      wrong in Chinese too; English only made it look deliberate.

      The words for these three already exist at `transport.modes.*`, keyed on
      the uppercase `TravelMode` the routing code uses. The brief stores them
      lowercase, so this maps one spelling onto the other rather than adding a
      second set of labels for the same three modes.
    */
    read.push(i18n.t('plan.brief.read.transport', {
      modes: brief.transport
        .map(mode => i18n.t(`transport.modes.${mode.toUpperCase()}`))
        .join(i18n.t('common.listSeparator')),
    }));
  }

  if (CLOCK.test(clean(parse.dayStartTime))) {
    brief.dayStartTime = clean(parse.dayStartTime);
    read.push(i18n.t('plan.brief.read.dayStart', { time: brief.dayStartTime }));
  }

  const notes = notesFrom(parse, base.notes);
  if (notes !== clean(base.notes)) brief.notes = notes;

  const interests = cleanList(parse.interests);
  const mustDo = cleanList(parse.mustDo);
  const lodging = clean(parse.lodging);
  const separator = i18n.t('common.listSeparator');
  if (interests.length) read.push(i18n.t('plan.brief.read.interests', { items: interests.join(separator) }));
  if (lodging) read.push(i18n.t('plan.brief.read.lodging', { lodging }));
  if (mustDo.length) read.push(i18n.t('plan.brief.read.mustDo', { items: mustDo.join(separator) }));
  if (!clean(parse.startDate) && parse.month) read.push(i18n.t('plan.brief.read.month', { month: parse.month }));

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
  if (!clean(parse.destination)) missing.push(i18n.t('plan.brief.unread.destination'));
  if (!ISO_DATE.test(clean(parse.startDate)) && !parse.days) missing.push(i18n.t('plan.brief.unread.days'));
  if (typeof parse.travellers !== 'number') missing.push(i18n.t('plan.brief.unread.travellers'));
  if (parse.pace !== 2 && parse.pace !== 3 && parse.pace !== 4) missing.push(i18n.t('plan.brief.unread.pace'));
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
    throw new Error(typeof payload?.error === 'string' ? payload.error : i18n.t('plan.brief.readFailed'));
  }
  return (payload || {}) as SentenceParse;
};
