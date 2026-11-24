import type { BriefTransport } from './tripPlanBrief';
import type { FlightAnchor } from '../types';
import { tripInvolvesFlying } from './tripInvolvesFlying';

/**
 * Which preparation sections a trip is expected to need.
 *
 * 「我覺得像是租車與航班資訊 應該是用戶在建立旅程時有點選才需要出現」.
 *
 * The first attempt keyed this on 國內/國外, and that was a guess dressed as a
 * rule: 松山→澎湖 and 松山→金門 are domestic flights, so scope never answered
 * whether a trip has a plane in it. What the traveller SAID they are doing
 * does answer it — somebody driving wants the rental card, somebody taking
 * the train does not, on either side of a border.
 *
 * Expected, never required. Nothing here deletes a section: the caller keeps
 * an unexpected one reachable behind one tap, because a 澎湖 traveller who
 * picked 火車 and later booked a flight must still have somewhere to put it.
 * Hiding a field is a layout choice; removing it loses the traveller's data.
 */

/** The modes that make a section part of this trip. */
const SECTION_MODES: Record<PlanSection, BriefTransport[]> = {
  flights: ['flight'],
  rental: ['drive'],
};

export type PlanSection = 'flights' | 'rental';

/**
 * What else the trip knows, when the stated plan is not the whole answer.
 *
 * Only 'flights' reads these, and only through `tripInvolvesFlying`. They are
 * optional so the rental call site stays exactly as it was.
 */
export interface SectionContext {
  tripScope?: 'domestic' | 'international';
  flightAnchors?: Partial<Pick<FlightAnchor, 'departureDate'>>[];
}

/**
 * Whether this trip is expected to need a section.
 *
 * Nobody said is not 'no'. An empty or absent selection shows everything, for
 * the same reason `undefined` is not domestic in the entry-rules block: a
 * section hidden on a guess is discovered when the traveller goes looking for
 * somewhere to type their flight number.
 */
export const sectionIsExpected = (
  section: PlanSection,
  transport?: BriefTransport[],
  context: SectionContext = {},
): boolean => {
  /*
    Flying is not decided here. 「國內旅遊又出現了飛機」 — this function and
    `missingAnchors` were both answering 「does this trip involve a plane?」,
    from different fields, and disagreeing: the ask had gone quiet for a
    domestic trip while this one still opened the boarding-pass form. One home
    now, and `tests/oneHomeForFlying` asserts it stays one.
  */
  if (section === 'flights') {
    return tripInvolvesFlying({
      tripScope: context.tripScope,
      tripTransport: transport,
      flightAnchors: context.flightAnchors,
    });
  }
  if (!transport || transport.length === 0) return true;
  return transport.some(mode => SECTION_MODES[section].includes(mode));
};
