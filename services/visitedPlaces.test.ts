/**
 * 「收藏的筆記中，若某次旅行有去過。要記錄：去的時間，並標註『已訪』」.
 */
import { describe, expect, it } from 'vitest';
import { visitLabel, visitOf, visitsByPlace } from './visitedPlaces';
import { ItineraryItem, SavedTravelInspiration, Trip } from '../types';

const TODAY = '2026-10-14';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', title: '', location: '', notes: '', type: 'ACTIVITY',
  date: '2026-03-22', time: '10:00', ...over,
} as ItineraryItem);

const trip = (name: string, itinerary: ItineraryItem[]): Pick<Trip, 'name' | 'itinerary'> =>
  ({ name, itinerary });

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration =>
  ({ placeName: '', ...over } as SavedTravelInspiration);

describe('已訪的地點', () => {
  it('認得同一個 Google 地點，不管名字怎麼寫', () => {
    const visits = visitsByPlace(
      [trip('東京 2026 春', [item({ placeId: 'ChIJx', location: 'らぁ麺や 嶋' })])],
      TODAY,
    );

    const visit = visitOf(saved({ placeId: 'ChIJx', placeName: '嶋' }), visits);
    expect(visit?.date).toBe('2026-03-22');
    expect(visit?.tripName).toBe('東京 2026 春');
  });

  /* A place saved before it was ever resolved has only its name to match on. */
  it('沒有地圖 id 時用名字比對，大小寫與空白不算差異', () => {
    const visits = visitsByPlace([trip('釜山', [item({ location: ' Photowave ' })])], TODAY);

    expect(visitOf(saved({ placeName: 'photowave' }), visits)?.date).toBe('2026-03-22');
  });

  /* 「去的時間」 — the most recent one, when there are several. */
  it('去過好幾次時留最近的一次', () => {
    const visits = visitsByPlace([
      trip('第一次', [item({ id: 'a', placeId: 'ChIJx', date: '2025-05-02' })]),
      trip('第二次', [item({ id: 'b', placeId: 'ChIJx', date: '2026-03-22' })]),
    ], TODAY);

    const visit = visitOf(saved({ placeId: 'ChIJx' }), visits);
    expect(visit?.date).toBe('2026-03-22');
    expect(visit?.tripName).toBe('第二次');
  });

  /*
    A plan is not a visit. The Tokyo trip on screen runs 10/20–10/24 and is
    still ahead; marking those places 「已訪」 would be the app telling the
    traveller they have been somewhere they have not.
  */
  it('還沒到的日子不算去過', () => {
    const visits = visitsByPlace(
      [trip('東京', [item({ placeId: 'ChIJx', date: '2026-10-22' })])],
      TODAY,
    );

    expect(visitOf(saved({ placeId: 'ChIJx' }), visits)).toBeUndefined();
  });

  it('今天還沒過完，也不算', () => {
    const visits = visitsByPlace([trip('東京', [item({ placeId: 'ChIJx', date: TODAY })])], TODAY);

    expect(visitOf(saved({ placeId: 'ChIJx' }), visits)).toBeUndefined();
  });

  it('沒去過的就是沒去過', () => {
    expect(visitOf(saved({ placeName: 'Levain' }), visitsByPlace([], TODAY))).toBeUndefined();
    expect(visitLabel(undefined)).toBe('');
  });

  it('標籤寫出去的時間', () => {
    expect(visitLabel({ date: '2026-03-22' })).toBe('已訪 · 2026/03/22');
  });
});
