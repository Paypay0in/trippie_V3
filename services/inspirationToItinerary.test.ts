/**
 * 「目前要將這些筆記加入行程只能用 AI 也要有可以手動更新選後輸入的選項」.
 *
 * Choosing three places and a day is a decision the traveller has already made.
 * Routing it through a model that re-orders the day, invents times and may drop
 * one of them answers a question nobody asked.
 */
import { describe, expect, it } from 'vitest';
import {
  inspirationGroupToItineraryItem,
  selectedInspirationsToItineraryItems,
} from './inspirationToItinerary';
import { TripInspirationPlaceGroup } from './tripInspirationSelection';

const note = (text: string) => ({
  id: `n-${text}`, sourceNoteId: `sn-${text}`, sourceSliceId: 'ss1',
  sourcePostId: 'post-1', sourceCreatorId: 'creator-1',
  type: 'recommendation' as const, text,
});

const group = (over: Partial<TripInspirationPlaceGroup> = {}): TripInspirationPlaceGroup => ({
  id: 'g-noodles',
  placeName: '大師兄牛肉麵',
  country: '韓國',
  city: '釜山',
  inspirationIds: ['insp-1'],
  experienceNotes: [note('晚上七點後要排隊')],
  missingPlaceIdentity: false,
  matchBasis: 'country',
  placeId: 'ChIJnoodles',
  formattedAddress: '釜山市西面路 1 號',
  coordinates: { latitude: 35.15, longitude: 129.06 },
  ...over,
} as TripInspirationPlaceGroup);

let counter = 0;
const makeId = () => `new-${(counter += 1)}`;

describe('手動把收藏放到行程上', () => {
  it('帶著地點身分與地址——跟 AI 那條路產出的是同一張卡', () => {
    const item = inspirationGroupToItineraryItem(group(), makeId, '2026-10-04');

    expect(item.title).toBe('大師兄牛肉麵');
    expect(item.date).toBe('2026-10-04');
    expect(item.placeId).toBe('ChIJnoodles');
    expect(item.address).toBe('釜山市西面路 1 號');
    expect(item.latitude).toBe(35.15);
  });

  it('筆記跟著走', () => {
    const item = inspirationGroupToItineraryItem(group(), makeId, '2026-10-04');

    expect(item.savedTravelNotes?.map(entry => entry.text)).toEqual(['晚上七點後要排隊']);
  });

  it('留著來源連結——沒有它，重新載入時筆記會被丟掉', () => {
    const item = inspirationGroupToItineraryItem(group(), makeId);

    expect(item.sourceInspirationIds).toEqual(['insp-1']);
  });

  it('不發明時間——手動加的人說的是「去哪」，不是「幾點」', () => {
    expect(inspirationGroupToItineraryItem(group(), makeId, '2026-10-04').time).toBe('');
  });

  it('可以先不指定日期，之後再拖', () => {
    expect(inspirationGroupToItineraryItem(group(), makeId).date).toBeUndefined();
  });

  it('沒連結到地圖的收藏也加得進去，只是沒有座標', () => {
    const bare = group({ placeId: undefined, formattedAddress: undefined, coordinates: undefined });
    const item = inspirationGroupToItineraryItem(bare, makeId);

    expect(item.title).toBe('大師兄牛肉麵');
    expect(item.placeId).toBeUndefined();
    expect(item.latitude).toBeUndefined();
  });
});

describe('一次加入選取的那幾個', () => {
  const groups = [
    group({ id: 'g-1', placeName: '味贊王鹽烤肉', inspirationIds: ['insp-1'] }),
    group({ id: 'g-2', placeName: '螞蟻家辣炒章魚', inspirationIds: ['insp-2'] }),
    group({ id: 'g-3', placeName: '海雲台傳統市場', inspirationIds: ['insp-3'] }),
  ];

  it('只加勾選的，而且照清單上的順序', () => {
    const items = selectedInspirationsToItineraryItems(groups, ['g-2', 'g-1'], makeId, '2026-10-04');

    expect(items.map(item => item.title)).toEqual(['味贊王鹽烤肉', '螞蟻家辣炒章魚']);
  });

  it('沒有勾選就不產生任何東西', () => {
    expect(selectedInspirationsToItineraryItems(groups, [], makeId)).toEqual([]);
  });

  it('每一張卡片都有自己的 id', () => {
    const items = selectedInspirationsToItineraryItems(groups, ['g-1', 'g-2', 'g-3'], makeId);

    expect(new Set(items.map(item => item.id)).size).toBe(3);
  });
});
