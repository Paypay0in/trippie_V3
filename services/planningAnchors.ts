import { FlightAnchor } from '../types';
import { StaySpan, formatStayDates } from './stayIntake';

/**
 * The two fixed points a trip is actually planned around.
 *
 * 「要他們先傳航班與住宿資訊 並提示：要先確定航班與住宿地點 才能相應依據這兩個點
 *   做規劃」.
 *
 * The planner was given the destination, the dates, the free days and the
 * traveller's own sentence — and not one word about where they sleep or when
 * they land. So it proposed an overnight trip to 由布院 without noticing that
 * meant changing hotels, and treated the arrival day as a whole day.
 *
 * It was not ignoring those costs. It could not see them.
 *
 * Both halves live here: the facts, written for the prompt, and the question
 * of whether there are any. A planner asked to work without them produces an
 * answer that looks the same as one written with them, which is the reason
 * the Founder asked for a gate rather than a hint.
 */

export interface PlanningAnchorsInput {
  flightAnchors?: FlightAnchor[];
  stays?: StaySpan[];
}

export type MissingAnchor = 'flights' | 'stays';

/** What the trip still needs before a plan can be shaped around anything. */
export const missingAnchors = ({ flightAnchors = [], stays = [] }: PlanningAnchorsInput): MissingAnchor[] => {
  const missing: MissingAnchor[] = [];
  // A flight with no date anchors nothing: the point is knowing which hours
  // of which day are already spent.
  if (!flightAnchors.some(anchor => anchor.departureDate)) missing.push('flights');
  // A stay is only an anchor once it says where. A name with no address and
  // no coordinates cannot group a day geographically, which is the whole job.
  if (!stays.some(stay => stay.name && (stay.address || typeof stay.latitude === 'number'))) {
    missing.push('stays');
  }
  return missing;
};

export const ANCHOR_LABEL: Record<MissingAnchor, string> = {
  flights: '航班資訊',
  stays: '住宿資訊',
};

/**
 * The arrival and departure, as hours rather than as dates.
 *
 * A six-day trip landing at 18:40 has five usable days and one evening, and
 * the planner that reads 「6 天」 will propose six. The times are what make
 * that difference visible, so they are reported even when the airport is not.
 */
const flightLines = (anchors: FlightAnchor[]): string[] => {
  const lines: string[] = [];
  for (const direction of ['OUTBOUND', 'RETURN'] as const) {
    const anchor = anchors.find(candidate => candidate.direction === direction && candidate.departureDate);
    if (!anchor) continue;

    if (direction === 'OUTBOUND') {
      const date = anchor.arrivalDate || anchor.departureDate;
      const time = anchor.arrivalTime;
      const where = anchor.arrivalAirport || anchor.arrivalAirportCity || '目的地';
      lines.push(time
        ? `抵達：${date} ${time} 到 ${where}。抵達當天只剩下半天，不要當成完整的一天來排。`
        : `抵達日：${date}。`);
    } else {
      const { departureDate, departureTime } = anchor;
      const where = anchor.departureAirport || anchor.departureAirportCity || '機場';
      lines.push(departureTime
        ? `離開：${departureDate} ${departureTime} 從 ${where} 起飛。當天要留出到機場與報到的時間，不要安排整天的行程。`
        : `離開日：${departureDate}。`);
    }
  }
  return lines;
};

/**
 * Where they sleep, and on which nights.
 *
 * Listed one by one rather than summarised, because a second property is the
 * fact that matters most: it means the trip already changes base, and a plan
 * that proposes another move is asking for a third.
 */
const stayLines = (stays: StaySpan[]): string[] => {
  const known = stays.filter(stay => stay.name && (stay.address || typeof stay.latitude === 'number'));
  if (known.length === 0) return [];

  const lines = known.map(stay => {
    const where = stay.address ? `（${stay.address}）` : '';
    const when = formatStayDates(stay);
    return `住宿：${stay.name}${where}，${when}。`;
  });

  lines.push(known.length === 1
    ? '整趟住同一間，所以每天的行程都要能回到這裡，不要提出需要換住宿的方案。'
    : `這趟已經換 ${known.length} 次住宿，再提出需要換宿的方案前要先說明代價。`);

  return lines;
};

/**
 * The anchors as a paragraph for the prompt, or '' when there are none.
 *
 * Written as sentences rather than fields because that is what the prompt
 * already takes beside it — `tripDaysBrief` and `travellerBriefText` both
 * hand their part over this way, and two shapes for the same job is how one
 * of them stops being read.
 */
export const anchorsBrief = ({ flightAnchors = [], stays = [] }: PlanningAnchorsInput): string => {
  const parts = [...flightLines(flightAnchors), ...stayLines(stays)];
  if (parts.length === 0) return '';
  return `這趟旅程已經確定的固定點：${parts.join('')}請以住宿地點為中心安排每天的行程，同一天的地點要在同一區，不要讓旅人為了一個點橫跨整個城市。`;
};
