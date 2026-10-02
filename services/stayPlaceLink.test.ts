/**
 * 「住宿訊息補上了，但為何行程方塊找不到住宿點，不合理」.
 *
 * His hotel card carried the full Gwangalli street address, printed it twice,
 * and still said 地圖上沒有這個地點 — because everything downstream keys on
 * `placeId`, not on an address string. The visible cost was the next complaint
 * in the same message: every leg touching the hotel read 「其中一個地點還沒連結
 * 地圖，無法計算交通時間」, so the transport block with its 大眾運輸／開車／步行
 * choice never appeared for the one place he returns to every night.
 */
import { describe, expect, it } from 'vitest';
import { linkStayItems, stayNeedsPlaceLink, stayPlaceQuery } from './stayPlaceLink';
import { ItineraryItem } from '../types';

const KENT: ItineraryItem = {
  id: 'stay-1',
  time: '21:55',
  title: '入住 Kent Hotel Gwangalli by Kensington',
  location: '229, Gwanganhaebyeon-ro, Suyeong-gu, 48303 Busan, South Korea',
  address: '229, Gwanganhaebyeon-ro, Suyeong-gu, 48303 Busan, South Korea',
  notes: '共 5 晚，2026-10-07 退房',
  type: 'HOTEL',
  date: '2026-10-02',
  fixedEventKind: 'accommodation',
};

const RESOLVED = {
  placeId: 'ChIJkent',
  resolvedPlaceName: 'Kent Hotel Gwangalli by Kensington',
  address: '229 Gwanganhaebyeon-ro, Suyeong-gu, Busan',
  latitude: 35.1532,
  longitude: 129.1186,
};

describe('要搜尋的字串', () => {
  it('名稱加地址一起查——名稱會在連鎖飯店間重複，地址單獨查到的是建築物', () => {
    expect(stayPlaceQuery('Kent Hotel Gwangalli by Kensington', '229, Gwanganhaebyeon-ro, Busan'))
      .toBe('Kent Hotel Gwangalli by Kensington 229, Gwanganhaebyeon-ro, Busan');
  });

  it('只有其中一個也查得動', () => {
    expect(stayPlaceQuery('某民宿', undefined)).toBe('某民宿');
    expect(stayPlaceQuery(undefined, '台北市信義路五段 7 號')).toBe('台北市信義路五段 7 號');
  });

  it('兩個都沒有就不要查', () => {
    expect(stayPlaceQuery(undefined, '   ')).toBe('');
  });
});

describe('哪些住宿需要連結', () => {
  it('有地址、沒有 placeId 的住宿要連結', () => {
    expect(stayNeedsPlaceLink(KENT)).toBe(true);
  });

  it('已經連結過的不再查一次', () => {
    expect(stayNeedsPlaceLink({ ...KENT, placeId: 'ChIJkent' })).toBe(false);
  });

  it('不是住宿的項目不碰', () => {
    expect(stayNeedsPlaceLink({ ...KENT, type: 'ACTIVITY', fixedEventKind: undefined })).toBe(false);
  });
});

describe('把查到的地點接上去', () => {
  it('住宿卡片拿到 placeId 與座標——交通時間要的就是這兩個', () => {
    const [linked] = linkStayItems([KENT], RESOLVED);

    expect(linked.placeId).toBe('ChIJkent');
    expect(linked.latitude).toBe(35.1532);
    expect(linked.longitude).toBe(129.1186);
  });

  it('入住與退房是同一間飯店，兩張卡都接上', () => {
    const checkout: ItineraryItem = { ...KENT, id: 'stay-2', date: '2026-10-07', time: '11:00', title: '退房 Kent Hotel' };

    expect(linkStayItems([KENT, checkout], RESOLVED).every(item => item.placeId === 'ChIJkent')).toBe(true);
  });

  it('同一批裡的其他項目不受影響', () => {
    const transfer: ItineraryItem = { ...KENT, id: 't-1', type: 'TRANSPORT', fixedEventKind: undefined, title: '前往飯店' };

    expect(linkStayItems([KENT, transfer], RESOLVED)[1].placeId).toBeUndefined();
  });

  it('查不到就原封不動，訂房還是會進行程', () => {
    expect(linkStayItems([KENT], null)).toEqual([KENT]);
    expect(linkStayItems([KENT], { ...RESOLVED, placeId: undefined })).toEqual([KENT]);
  });

  it('Google 沒給地址時，保留訂房單上原本的地址——那不是猜的', () => {
    const [linked] = linkStayItems([KENT], { ...RESOLVED, address: undefined });

    expect(linked.address).toBe(KENT.address);
  });

  it('座標不完整就只接 placeId，不寫入壞座標', () => {
    const [linked] = linkStayItems([KENT], { ...RESOLVED, latitude: Number.NaN, longitude: Number.NaN } as never);

    expect(linked.placeId).toBe('ChIJkent');
    expect(linked.latitude).toBeUndefined();
  });
});
