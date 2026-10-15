/**
 * 「到底航班起飛都還沒抵達為何會放逛美術館」.
 *
 * Built from `itemsFromFlightAnchor` rather than from hand-written fixtures,
 * because the previous version of this check used an invented id and proved
 * nothing: `roleOf` reads the role out of the id, and only the generator knows
 * what that id is. His own outbound, 2026/10/20 06:35 → 11:00.
 */
import { describe, expect, it } from 'vitest';
import { itemsFromFlightAnchor } from './flightDerivedItems';
import { earliestFreeStartByDate, fixedAnchorSchedule } from './itineraryDayFloor';
import { notBeforeTheFloor, timeTheUntimed } from './separateOverlaps';
import { optimiseTripRoute } from './optimiseTripRoute';
import { ItineraryItem } from '../types';

const outbound = {
  id: 'out',
  direction: 'outbound',
  departureDate: '2026-10-20',
  departureTime: '06:35',
  departureAirport: 'Taiwan Taoyuan International Airport',
  arrivalDate: '2026-10-20',
  arrivalTime: '11:00',
  arrivalAirport: 'Narita International Airport',
  arrivalAirportLatitude: 35.7720,
  arrivalAirportLongitude: 140.3929,
} as never;

const museum = {
  id: 'museum', title: '東京都現代美術館', location: '東京都現代美術館', notes: '',
  type: 'ACTIVITY', date: '2026-10-20', time: '10:00', durationMinutes: 60,
  latitude: 35.6797, longitude: 139.8003,
} as ItineraryItem;

describe('那一天真的被落地時間框住', () => {
  const derived = itemsFromFlightAnchor(outbound) as ItineraryItem[];

  it('航班錨點真的產出一筆落地項目', () => {
    const landing = derived.find(item => item.title === '航班抵達');
    expect(landing?.time).toBe('11:00');
    expect(landing?.id.startsWith('flight-landing-')).toBe(true);
  });

  it('那一天的開放時間在落地之後', () => {
    const floor = earliestFreeStartByDate(fixedAnchorSchedule(derived))['2026-10-20'];
    expect(floor).toBeTruthy();
    expect(floor >= '11:00').toBe(true);
  });

  it('AI 加的美術館會被推到開放時間之後', () => {
    const { items } = notBeforeTheFloor([...derived, museum], new Set(['museum']));
    expect(items.find(item => item.id === 'museum')!.time >= '11:00').toBe(true);
  });

  it('沒給時間的也是', () => {
    const { items } = timeTheUntimed(
      [...derived, { ...museum, time: '' }],
      new Set(['museum']),
    );
    expect(items.find(item => item.id === 'museum')!.time >= '11:00').toBe(true);
  });

  /*
    Not 「at or after the landing」 — that is the assertion that let 11:00 pass,
    and 11:00 is the minute the wheels touch the ground. 成田 to 江東區 is 55 km,
    so the museum cannot open before the journey has happened.
  */
  it('優化動線會把從機場過去的時間算進去', () => {
    const plan = optimiseTripRoute([...derived, museum], { country: '日本', dayStart: '10:00' });
    const placed = plan.days.flatMap(day => day.items).find(item => item.id === 'museum');

    expect(placed!.time > '12:00').toBe(true);
  });
});
