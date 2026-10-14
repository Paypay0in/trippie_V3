import { describe, expect, it } from 'vitest';
import { buildTripAreas } from './tripAreas';
import { ItineraryItem } from '../types';

/**
 * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」.
 *
 * The collection already groups by area; the plan is where that pays off,
 * because the plan is where a day gets built. A 海雲台 card and a 海雲台 saved
 * place have to wear the same colour, or the colour means one thing on one
 * screen and something else on the next.
 */

const item = (id: string, location: string, latitude: number, longitude: number, address?: string): ItineraryItem => ({
  id, title: location, location, notes: '', type: 'ACTIVITY',
  date: '2026-10-04', time: '09:00', latitude, longitude, address,
} as ItineraryItem);

const group = (id: string, placeName: string, latitude: number, longitude: number, formattedAddress?: string) =>
  ({ id, placeName, coordinates: { latitude, longitude }, formattedAddress });

describe('buildTripAreas', () => {
  const itinerary = [
    item('it-market', '海雲台傳統市場', 35.1615, 129.1622, '22-1 Gunam-ro 41beon-gil, Haeundae, Busan'),
    item('it-temple', 'Beomeosa Temple', 35.2847, 129.0693, '250 Beomeosa-ro, Geumjeong-gu, Busan'),
  ];
  const inspirations = [
    group('g-ant', '螞蟻家辣炒章魚', 35.1611, 129.1607, '34 Gunam-ro, Haeundae, Busan'),
    group('g-nasari', 'Nasari Sigdang', 35.1535, 129.1190, 'Suyeong-gu, Gwangan-ro 61beon-gil, Busan'),
  ];

  it('gives a plan card and a saved place in the same area the same colour', () => {
    const areas = buildTripAreas({ itinerary, inspirationGroups: inspirations });

    expect(areas.areaOfItem('it-market')?.colorIndex)
      .toBe(areas.areaOfInspiration('g-ant')?.colorIndex);
  });

  it('keeps a different area a different colour', () => {
    const areas = buildTripAreas({ itinerary, inspirationGroups: inspirations });

    expect(areas.areaOfItem('it-temple')?.colorIndex)
      .not.toBe(areas.areaOfItem('it-market')?.colorIndex);
  });

  it('names the area the plan card is in', () => {
    const areas = buildTripAreas({ itinerary, inspirationGroups: inspirations });

    expect(areas.areaOfItem('it-market')?.label).toBe('Haeundae');
    expect(areas.areaOfItem('it-temple')?.label).toBe('Geumjeong-gu');
  });

  it('keeps an itinerary item and a saved place as two rows', () => {
    // The same restaurant on the plan and in the collection is two things that
    // share an area, not one thing counted twice.
    const areas = buildTripAreas({
      itinerary: [item('it-ant', '螞蟻家辣炒章魚', 35.1611, 129.1607, '34 Gunam-ro, Haeundae')],
      inspirationGroups: [group('g-ant', '螞蟻家辣炒章魚', 35.1611, 129.1607, '34 Gunam-ro, Haeundae')],
    });

    expect(areas.clusters[0].places).toHaveLength(2);
  });

  it('says nothing about an item with no location', () => {
    const areas = buildTripAreas({
      itinerary: [...itinerary, { id: 'it-free', title: '自由活動', location: '', notes: '', type: 'ACTIVITY' } as ItineraryItem],
      inspirationGroups: inspirations,
    });

    expect(areas.areaOfItem('it-free')).toBeUndefined();
  });

  it('is empty for a trip with nothing located yet', () => {
    expect(buildTripAreas({}).clusters).toEqual([]);
  });
});

/**
 * 「沒裂」.
 *
 * The collection screen passed each place's ward to the clusterer and the
 * trip's own areas did not: this list is built field by field, and the ward was
 * not in it. So the rule that a ward decides an area before distance does
 * applied on one screen and not the other, and the day summary kept reporting
 * one 5.9 km area across half of Tokyo.
 *
 * Itinerary items have no ward field at all — only an address — so the
 * clusterer reads theirs out of it, with the same reader that names the
 * heading.
 */
describe('一區不能跨到別的區', () => {
  const japan = { country: '日本' };

  it('收藏的地點依照自己的區分開，即使很近', () => {
    const areas = buildTripAreas({
      ...japan,
      inspirationGroups: [
        { id: 'a', placeName: '代代木', coordinates: { latitude: 35.6830, longitude: 139.7020 }, district: 'Shibuya' },
        { id: 'b', placeName: '新宿御苑', coordinates: { latitude: 35.6852, longitude: 139.7101 }, district: 'Shinjuku City' },
      ],
    });

    // 2.0 km apart: close enough that distance alone had joined them.
    expect(areas.clusters).toHaveLength(2);
    expect(areas.areaOfInspiration('a')?.label).not.toBe(areas.areaOfInspiration('b')?.label);
  });

  /* An itinerary item carries no ward, so it is read out of the address. */
  it('行程項目的區從地址讀出來', () => {
    const areas = buildTripAreas({
      ...japan,
      itinerary: [
        {
          id: 'i1', title: '新宿御苑', location: '新宿御苑', notes: '', type: 'ACTIVITY',
          date: '2026-10-22', time: '10:00',
          latitude: 35.6852, longitude: 139.7101, address: '東京都新宿区内藤町11',
        },
        {
          id: 'i2', title: '代代木', location: '代代木', notes: '', type: 'ACTIVITY',
          date: '2026-10-22', time: '13:00',
          latitude: 35.6830, longitude: 139.7020, address: '東京都渋谷区代々木1丁目',
        },
      ] as never,
    });

    expect(areas.clusters).toHaveLength(2);
  });
});
