/**
 * Whether there is a ground journey to plan between two consecutive cards.
 *
 * 「你看這邊行程與行程中間」 — the timeline offered 「大眾運輸 / 開車 / 步行」 between
 * 抵達機場 and 航班起飛, which are the same building, and again between 航班起飛
 * and 航班抵達, which is the flight. It then reported 「這個地區查不到大眾運輸路線」
 * for both, because it had gone looking for a bus from Taoyuan to Narita.
 *
 * The three cards a flight produces — 抵達機場, 航班起飛, 航班抵達 — all carry the
 * same `derivedFromFlightAnchorId`, and between any two of them there is
 * nothing for a traveller to arrange: the first is the journey to the airport,
 * and the rest is the aeroplane. The gap between them is already explained on
 * the cards themselves, by the check-in buffer and the two flight times.
 *
 * Keyed on the anchor rather than on distance, because the two cases differ:
 * one pair is zero kilometres apart and the other is two thousand. What they
 * have in common is that one flight produced both.
 */
import { ItineraryItem } from '../types';

export const hasGroundJourneyBetween = (
  item: Pick<ItineraryItem, 'derivedFromFlightAnchorId'>,
  next: Pick<ItineraryItem, 'derivedFromFlightAnchorId'>,
): boolean =>
  !item.derivedFromFlightAnchorId ||
  item.derivedFromFlightAnchorId !== next.derivedFromFlightAnchorId;
