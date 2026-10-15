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

/**
 * Far enough apart that no road connects them in a day.
 *
 * 「航班起飛（桃園）→ 🚗 查不到這段的開車路線 → 東京都現代美術館」. Honest about the
 * lookup and wrong about the question: there is no drive from Taoyuan to Kōtō,
 * and asking produced a card offering 大眾運輸 / 開車 / 步行 across an ocean.
 *
 * The same threshold the day map uses, for the same reason: beyond it, the two
 * points are not part of one day's ground movement however the items are
 * typed.
 */
const NO_ROAD_BETWEEN_KM = 100;

const EARTH_RADIUS_KM = 6371;

const kmBetween = (
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

type LegEnd = Pick<ItineraryItem, 'derivedFromFlightAnchorId' | 'latitude' | 'longitude'>;

export const hasGroundJourneyBetween = (
  item: LegEnd,
  next: LegEnd,
): boolean => {
  // Both halves of one flight: there is nothing to travel between.
  if (item.derivedFromFlightAnchorId
    && item.derivedFromFlightAnchorId === next.derivedFromFlightAnchorId) return false;

  /*
    Two points an ocean apart. The flight between them is the journey, and it
    is already on the plan as its own card.
  */
  if (typeof item.latitude === 'number' && typeof item.longitude === 'number'
    && typeof next.latitude === 'number' && typeof next.longitude === 'number') {
    const across = kmBetween(
      { latitude: item.latitude, longitude: item.longitude },
      { latitude: next.latitude, longitude: next.longitude },
    );
    if (across > NO_ROAD_BETWEEN_KM) return false;
  }

  return true;
};
