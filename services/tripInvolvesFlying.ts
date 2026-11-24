import type { BriefTransport } from './tripPlanBrief';
import type { FlightAnchor } from '../types';

/**
 * Whether this trip is one the app should bring up flying about. One home.
 *
 * 「國內旅遊又出現了飛機」, three weeks after ab4f2d8 fixed 「國內旅遊沒有這個」.
 * The Founder: 「怎麼一直在修重複的問題」. He was right, and the reason was the
 * shape this repo keeps paying for — the same question answered in two places,
 * where the second one knows less:
 *
 *   planningAnchors.missingAnchors  read tripScope, and stopped ASKING a
 *                                   domestic trip for a boarding pass.
 *   tripSections.sectionIsExpected  read tripTransport, and decided whether
 *                                   the boarding-pass FORM opened expanded.
 *                                   It had never heard of tripScope.
 *
 * So the app had already decided it would not ask a 花蓮 trip for a boarding
 * pass, and then spread a boarding-pass form across the screen. Neither half
 * was wrong on its own. Together they said two different things.
 *
 * Both callers now ask this function instead, and the test beside it asserts
 * that neither of them answers it again on its own. Correcting one of two
 * copies is how a rule comes back a third time.
 *
 * Order matters, strongest evidence first:
 *
 *   1. A dated flight on the trip. 松山→澎湖 and 松山→金門 are domestic flights
 *      and this is a fact, not a guess — it outranks everything below.
 *   2. What the traveller said at setup. Somebody who named 火車 crossing a
 *      border is not flying; somebody who named 飛機 inside one is.
 *   3. Nobody said: the scope decides. This is the only place scope is read,
 *      and only as a tiebreaker — never instead of 1 or 2, which is what made
 *      the original scope-keyed version a guess wearing a rule's clothes.
 *
 * `false` never deletes anything. It means 「do not lead with this」: the ask
 * goes quiet and the form collapses behind one tap, because a 澎湖 traveller
 * who skipped the question still needs somewhere to put a flight number.
 */

export interface FlyingSignals {
  /** 國內 or 國外, when the trip has been classified. */
  tripScope?: 'domestic' | 'international';
  /** How the traveller said they would get around, if they said. */
  tripTransport?: BriefTransport[];
  /**
   * Flights already on the trip.
   *
   * Only the date is read, and it is optional here even though `FlightAnchor`
   * requires it: a half-entered anchor is exactly the case this has to answer,
   * and a type that cannot describe one would push the check back out to the
   * callers — which is the shape this module exists to remove.
   */
  flightAnchors?: Partial<Pick<FlightAnchor, 'departureDate'>>[];
}

export const tripInvolvesFlying = (
  { tripScope, tripTransport, flightAnchors = [] }: FlyingSignals,
): boolean => {
  if (flightAnchors.some(anchor => anchor.departureDate)) return true;
  if (tripTransport && tripTransport.length > 0) return tripTransport.includes('flight');
  return tripScope !== 'domestic';
};
