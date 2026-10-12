import { FlightAnchor } from '../types';
import { airportCandidatesForCity } from './airportDirectory';

/**
 * Flights that disagree with the trip they are on.
 *
 * 「有一個問題點：我的標題是沖繩」 — a trip to 沖繩, 11/05–11/10, carrying a
 * ticket to 成田 on 10/20. Both facts were on the same screen, in the same
 * card, and nothing read them together.
 *
 * This is the night's recurring shape one more time: the information needed
 * to spot the contradiction was already there. The existing validation only
 * asks whether a field is empty — a filled field that contradicts the trip
 * passes it without a word.
 *
 * It matters more than it looks, because the planner is now fed these
 * anchors as fact. 「抵達：2026-10-20 11:00 到 成田國際機場」 for a November
 * trip to Okinawa is worse than telling it nothing: it reads like something
 * somebody confirmed.
 *
 * Reported, never corrected. A traveller connecting through Narita to Naha
 * is doing something real, and only they can say which it is.
 */

export interface AnchorContradiction {
  anchorId: string;
  kind: 'date' | 'airport';
  message: string;
}

const LEG_LABEL: Record<FlightAnchor['direction'], string> = {
  OUTBOUND: '去程',
  RETURN: '回程',
};

/**
 * Whether this airport could plausibly serve the destination.
 *
 * Reuses the table the flight form already suggests from, so the answer here
 * and the suggestions there can never drift apart. An unknown destination
 * returns no candidates, and then nothing is claimed — the table is
 * hand-maintained, and silence is the honest answer for a city nobody has
 * entered yet.
 */
const servesDestination = (airport: string | undefined, destination: string | undefined): boolean | undefined => {
  const named = (airport || '').trim();
  if (!named) return undefined;

  const candidates = airportCandidatesForCity(destination || '').candidates;
  if (candidates.length === 0) return undefined;

  const haystack = named.toLowerCase();
  return candidates.some(candidate =>
    haystack.includes(candidate.iataCode.toLowerCase())
    || haystack.includes(candidate.name.toLowerCase())
    || haystack.includes(candidate.city.toLowerCase()));
};

export interface AnchorCheckInput {
  anchors: FlightAnchor[];
  destination?: string;
  tripStartDate?: string;
  tripEndDate?: string;
}

export const anchorContradictions = ({
  anchors,
  destination,
  tripStartDate,
  tripEndDate,
}: AnchorCheckInput): AnchorContradiction[] => {
  const found: AnchorContradiction[] = [];

  for (const anchor of anchors) {
    const leg = LEG_LABEL[anchor.direction];

    /*
      The dates, which are unambiguous. A flight outside the trip's own range
      is not a judgement call — one of the two was typed for a different
      journey, and the traveller is the only one who knows which.
    */
    if (anchor.departureDate && tripStartDate && tripEndDate
      && (anchor.departureDate < tripStartDate || anchor.departureDate > tripEndDate)) {
      found.push({
        anchorId: anchor.id,
        kind: 'date',
        message: `${leg}是 ${anchor.departureDate}，不在這趟旅程的日期（${tripStartDate} – ${tripEndDate}）裡。`,
      });
    }

    /*
      The airport the traveller actually lands at on the way out, and leaves
      from on the way back. Checked only when the directory knows the
      destination; an unlisted city gets no claim rather than a guess.
    */
    const airport = anchor.direction === 'OUTBOUND' ? anchor.arrivalAirport : anchor.departureAirport;
    if (servesDestination(airport, destination) === false) {
      found.push({
        anchorId: anchor.id,
        kind: 'airport',
        message: `${leg}的機場是 ${airport}，看起來不是飛往${destination}的航班。`,
      });
    }
  }

  return found;
};

/**
 * Whether the planner should be told these flights at all.
 *
 * A contradicted anchor is withheld rather than sent with a caveat. The
 * prompt already carries a lot, and a sentence saying 「這可能是錯的」 beside a
 * precise time and airport loses to the precise time and airport every time
 * — the model has no way to weigh our doubt against our own numbers.
 */
export const anchorsAreTrustworthy = (input: AnchorCheckInput): boolean =>
  anchorContradictions(input).length === 0;

/**
 * The whole disagreement in one sentence, ending in a question.
 *
 * 「這張票是成田，但旅程是沖繩，確定嗎？」 — the Founder's own wording, and
 * better than the heading it replaced. 「航班跟這趟旅程對不起來」 states a
 * verdict and then makes the reader assemble the two facts from a list; this
 * puts them side by side, which is the comparison being asked about.
 *
 * Both halves when both disagree, because a ticket that is the wrong city
 * *and* the wrong month is a different situation from either alone — it is
 * almost certainly another trip.
 */
const shortAirport = (airport: string): string => {
  // 「NRT · Narita International Airport」 → 「Narita International Airport」.
  const named = airport.split('·').pop()?.trim();
  return named || airport.trim();
};

export const contradictionHeadline = (
  found: AnchorContradiction[],
  { anchors, destination, tripStartDate, tripEndDate }: AnchorCheckInput,
): string => {
  if (found.length === 0) return '';

  const dateOf = found.find(item => item.kind === 'date');
  const airportOf = found.find(item => item.kind === 'airport');

  const ticket: string[] = [];
  const trip: string[] = [];

  if (dateOf) {
    const anchor = anchors.find(candidate => candidate.id === dateOf.anchorId);
    if (anchor?.departureDate) ticket.push(anchor.departureDate);
    if (tripStartDate && tripEndDate) trip.push(`${tripStartDate} – ${tripEndDate}`);
  }

  if (airportOf) {
    const anchor = anchors.find(candidate => candidate.id === airportOf.anchorId);
    const airport = anchor
      ? (anchor.direction === 'OUTBOUND' ? anchor.arrivalAirport : anchor.departureAirport)
      : undefined;
    if (airport) ticket.push(shortAirport(airport));
    if (destination) trip.push(destination);
  }

  if (ticket.length === 0 || trip.length === 0) return '';
  return `這張票是${ticket.join('・')}，但旅程是${trip.join('・')}，確定嗎？`;
};
