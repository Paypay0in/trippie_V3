import { describe, expect, it } from 'vitest';
import { dayAreaSpread, daySpansTooManyAreas } from './dayAreaSpread';
import { buildTripAreas } from './tripAreas';
import { ItineraryItem } from '../types';

/**
 * 「行程表需要以色塊來提示用戶，讓他們能一目瞭然的知道自己選的各項行程是否在同一個
 * 區塊」.
 *
 * The colours say which area each stop is in; this says what they add up to.
 * His own Day 3 — 梵魚寺 in the north, a bathhouse in 東萊, a department store
 * at Centum — crossed the city three times.
 */

const item = (id: string, latitude?: number, longitude?: number, address?: string): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: '2026-10-04', time: '09:00',
  latitude, longitude, address,
} as ItineraryItem);

/** His Day 3, as it actually stood. */
const day3 = [
  item('temple', 35.2847, 129.0693, '250 Beomeosa-ro, Geumjeong-gu, Busan'),
  item('spa', 35.2156, 129.0859, '23 Geumganggongwon-ro 20beon-gil, Dongnae-gu, Busan'),
  item('store', 35.1689, 129.1300, '35 Centum nam-daero, Haeundae, Busan'),
];

/** A day spent in one place. */
const gwangalli = [
  item('nasari', 35.1535, 129.1190, 'Suyeong-gu, Gwangan-ro 61beon-gil, Busan'),
  item('working', 35.1529, 129.1181, 'Suyeong-gu, Gwanganhaebyeon-ro, Busan'),
];

describe('dayAreaSpread', () => {
  it('counts the areas a day touches', () => {
    const areas = buildTripAreas({ itinerary: day3 });

    expect(dayAreaSpread(day3, areas).areas).toHaveLength(3);
  });

  it('counts a day spent in one place as one', () => {
    const areas = buildTripAreas({ itinerary: gwangalli });

    expect(dayAreaSpread(gwangalli, areas).areas).toHaveLength(1);
  });

  it('measures the furthest two stops', () => {
    const areas = buildTripAreas({ itinerary: day3 });

    // 梵魚寺 to Centum is about 14km across the city.
    expect(dayAreaSpread(day3, areas).longestHopKm).toBeGreaterThan(10);
  });

  it('sets aside the stops that have no location', () => {
    const areas = buildTripAreas({ itinerary: day3 });
    const withFreeTime = [...day3, item('free')];

    expect(dayAreaSpread(withFreeTime, areas).unplacedCount).toBe(1);
    expect(dayAreaSpread(withFreeTime, areas).areas).toHaveLength(3);
  });

  it('has nothing to say about an empty day', () => {
    expect(dayAreaSpread([], buildTripAreas({}))).toEqual({
      areas: [], unplacedCount: 0, longestHopKm: undefined,
    });
  });
});

describe('daySpansTooManyAreas', () => {
  it('says so at three', () => {
    // Two is a day: a morning somewhere and dinner somewhere else. Three is a
    // day spent on the subway.
    const areas = buildTripAreas({ itinerary: day3 });

    expect(daySpansTooManyAreas(dayAreaSpread(day3, areas))).toBe(true);
  });

  it('stays quiet at one or two', () => {
    const areas = buildTripAreas({ itinerary: [...gwangalli, ...day3.slice(0, 1)] });

    expect(daySpansTooManyAreas(dayAreaSpread([...gwangalli, day3[0]], areas))).toBe(false);
  });
});
