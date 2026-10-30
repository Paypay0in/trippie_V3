import i18n from '../i18n/config';

/**
 * Whether a day's travel actually works, in one answer.
 *
 * 「最後再確認行程時，可以一鍵點選AI確認當日行程的交通規劃是否順暢，提供的更改建議
 * 等」 — the fourth of the rules the itinerary was rebuilt around.
 *
 * Each leg already says how long it takes, one at a time, where it sits. What
 * nobody could see was the day: four legs that each look fine but add up to
 * three hours on buses, one gap that is twenty minutes short, and a route that
 * crosses the city and comes back. Those are properties of the sequence, not
 * of any leg in it.
 *
 * Deliberately arithmetic rather than a model. 「這段來不及」 is a subtraction,
 * and a subtraction that is always right is worth more than a sentence that is
 * usually right — the traveller is standing in a station deciding whether to
 * run. The model's turn comes after, with the findings in hand.
 */

export interface CheckedLeg {
  /** The item being left, and the one being travelled to. */
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  /** Minutes the journey takes, when the provider answered. */
  journeyMinutes?: number;
  /** Minutes between leaving the first and the second one starting. */
  gapMinutes: number;
  /** Which area each end is in, when the trip has areas. */
  fromAreaIndex?: number;
  toAreaIndex?: number;
  fromAreaLabel?: string;
  toAreaLabel?: string;
}

export type TransportFindingKind = 'too_tight' | 'long_haul' | 'backtrack' | 'heavy_day' | 'unknown_leg';

export interface TransportFinding {
  kind: TransportFindingKind;
  /** One sentence, already written for the traveller. */
  message: string;
  /** The items it concerns, so the card can be pointed at. */
  itemIds: string[];
  /** True when the day as planned does not work, rather than merely costs. */
  blocking: boolean;
}

export interface DayTransportVerdict {
  findings: TransportFinding[];
  /** Total minutes spent travelling, over the legs that answered. */
  travelMinutes: number;
  /** Legs the provider had no route for; the total is short by these. */
  unknownLegs: number;
  /** True when nothing is wrong and the day was actually checkable. */
  smooth: boolean;
}

/** A single journey this long is the day's shape, not a detail. */
export const LONG_HAUL_MINUTES = 45;

/** Beyond this the day is mostly transport, whatever each leg says. */
export const HEAVY_DAY_MINUTES = 150;

/** Less slack than this and an ordinary delay misses the next booking. */
export const TIGHT_BUFFER_MINUTES = 10;

/**
 * Minutes as the traveller reads them. Exported because `DayTransportCheck.tsx`
 * renders the same total and used to carry a second copy that rounded
 * differently — and stripped 「 0 分」 out of its own output, which no longer
 * exists once the string is a translation.
 */
export const minutesLabel = (minutes: number): string =>
  (minutes >= 60 && minutes % 60 === 0
    ? i18n.t('transport.dayCheck.hours', { hours: minutes / 60 })
    : minutes >= 60
      ? i18n.t('transport.dayCheck.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : i18n.t('transport.dayCheck.minutes', { minutes }));

/**
 * Leaving an area and coming back to it later.
 *
 * Not merely 「two areas today」, which is an ordinary day. This is the one that
 * costs: A → B → A means the same journey was made twice, and the fix is
 * usually to swap two stops rather than to drop one.
 */
const backtracks = (legs: CheckedLeg[]): CheckedLeg[] => {
  const sequence = [
    ...legs.map(leg => ({ area: leg.fromAreaIndex, leg })),
    ...(legs.length ? [{ area: legs[legs.length - 1].toAreaIndex, leg: legs[legs.length - 1] }] : []),
  ].filter(entry => entry.area !== undefined);

  const found: CheckedLeg[] = [];
  for (let index = 2; index < sequence.length; index += 1) {
    const area = sequence[index].area;
    const previous = sequence[index - 1].area;
    if (area === previous) continue;
    // Seen before, and left since: the day has come back.
    const earlier = sequence.slice(0, index - 1).some(entry => entry.area === area);
    if (earlier) found.push(sequence[index].leg);
  }
  return found;
};

/**
 * What is wrong with today's travel, if anything.
 *
 * Ordered by what the traveller has to act on: what will not work first, then
 * what it costs. A day with nothing to say says so — the whole point of a check
 * is that a clean answer is as useful as a warning.
 */
export const checkDayTransport = (legs: CheckedLeg[]): DayTransportVerdict => {
  const findings: TransportFinding[] = [];

  const answered = legs.filter(leg => Number.isFinite(leg.journeyMinutes));
  const travelMinutes = answered.reduce((total, leg) => total + (leg.journeyMinutes as number), 0);
  const unknownLegs = legs.length - answered.length;

  for (const leg of answered) {
    const journey = leg.journeyMinutes as number;
    const slack = leg.gapMinutes - journey;
    if (slack < 0) {
      findings.push({
        kind: 'too_tight',
        blocking: true,
        itemIds: [leg.fromId, leg.toId],
        message: i18n.t('transport.dayCheck.tooTightBlocking', {
          from: leg.fromTitle,
          to: leg.toTitle,
          journey: minutesLabel(journey),
          gap: minutesLabel(Math.max(leg.gapMinutes, 0)),
          short: minutesLabel(Math.abs(slack)),
        }),
      });
    } else if (slack < TIGHT_BUFFER_MINUTES) {
      findings.push({
        kind: 'too_tight',
        blocking: false,
        itemIds: [leg.fromId, leg.toId],
        message: i18n.t('transport.dayCheck.tooTight', {
          from: leg.fromTitle,
          to: leg.toTitle,
          slack: minutesLabel(slack),
        }),
      });
    }
  }

  for (const leg of answered) {
    if ((leg.journeyMinutes as number) >= LONG_HAUL_MINUTES) {
      findings.push({
        kind: 'long_haul',
        blocking: false,
        itemIds: [leg.fromId, leg.toId],
        message: i18n.t('transport.dayCheck.longHaul', {
          from: leg.fromTitle,
          to: leg.toTitle,
          journey: minutesLabel(leg.journeyMinutes as number),
        }),
      });
    }
  }

  for (const leg of backtracks(legs)) {
    findings.push({
      kind: 'backtrack',
      blocking: false,
      itemIds: [leg.fromId, leg.toId],
      message: i18n.t('transport.dayCheck.backtrack', {
        area: leg.toAreaLabel || i18n.t('transport.dayCheck.thisArea'),
        from: leg.fromTitle,
        to: leg.toTitle,
      }),
    });
  }

  if (travelMinutes >= HEAVY_DAY_MINUTES) {
    findings.push({
      kind: 'heavy_day',
      blocking: false,
      itemIds: [],
      message: i18n.t('transport.dayCheck.heavyDay', { total: minutesLabel(travelMinutes) }),
    });
  }

  if (unknownLegs > 0) {
    findings.push({
      kind: 'unknown_leg',
      blocking: false,
      itemIds: [],
      message: i18n.t('transport.dayCheck.unknownLegs', { legs: unknownLegs }),
    });
  }

  return {
    findings,
    travelMinutes,
    unknownLegs,
    smooth: findings.length === 0 && answered.length > 0,
  };
};
