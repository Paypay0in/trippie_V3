/**
 * 「這時間序不 要先從金海國際機場「交通」到旅館 才會入住旅館
 *   輸入旅館的當下就已經應該帶入地址，就能夠依機場與旅館地址給交通建議與預估了」
 *
 * Day 1 in Busan showed 入住 Kent Hotel at 21:55 above 前往 Kent Hotel at 21:55
 * — the same minute for the ride and for the arrival, so the room came before
 * the car. And the transfer card carried no place at all, so the one journey
 * the app had already worked out was also the one it could not route.
 */
import { describe, expect, it } from 'vitest';
import { airportTransferItem, departAirportTime, reachHotelTime } from './arrivalPlan';
import { reconcileTransfers } from './airportTransfer';
import { defaultCheckInTime, staysFromItinerary } from './stayIntake';
import { ItineraryItem } from '../types';

/** His flight and his booking. */
const LANDING = { date: '2026-10-02', time: '19:55', airport: '金海國際機場' };
const KENT = {
  placeId: 'ChIJkent',
  latitude: 35.1532,
  longitude: 129.1186,
  address: '229, Gwanganhaebyeon-ro, Suyeong-gu, Busan',
};

const checkInItem: ItineraryItem = {
  id: 'stay-1', type: 'HOTEL', fixedEventKind: 'accommodation',
  title: '入住 Kent Hotel Gwangalli by Kensington',
  date: LANDING.date, time: '21:55', location: KENT.address, notes: '',
  ...KENT,
};

describe('抵達當天的順序', () => {
  it('離開機場、搭車、入住，三個時間嚴格遞增', () => {
    const leave = departAirportTime(LANDING.time)!;
    const arrive = reachHotelTime(LANDING.time)!;

    expect(leave).toBe('21:55');
    expect(arrive).toBe('22:25');
    expect(arrive > leave).toBe(true);
  });

  it('入住時間和交通卡片不再共用同一分鐘', () => {
    expect(defaultCheckInTime(LANDING.date, [LANDING]))
      .not.toBe(departAirportTime(LANDING.time));
  });

  it('有實際路線時用實際路線，入住跟著往後', () => {
    expect(reachHotelTime(LANDING.time, 48 * 60)).toBe('22:43');
  });
});

describe('交通卡片本身', () => {
  const stays = staysFromItinerary([checkInItem]);

  it('訂房的地點會被帶進去——這就是能算交通建議的原因', () => {
    expect(stays[0].placeId).toBe('ChIJkent');
    expect(stays[0].latitude).toBe(35.1532);
  });

  it('交通卡片拿到飯店的座標與地址，不再是「地圖上沒有這個地點」', () => {
    const [transfer] = reconcileTransfers(
      [],
      [{ arrival: LANDING, stay: stays[0] }],
      () => undefined,
      () => 'key',
    );

    expect(transfer.placeId).toBe('ChIJkent');
    expect(transfer.latitude).toBe(35.1532);
    expect(transfer.longitude).toBe(129.1186);
    expect(transfer.address).toBe(KENT.address);
  });

  it('飯店還沒連結地點時不會寫入假座標', () => {
    const unlinked = staysFromItinerary([{ ...checkInItem, placeId: undefined, latitude: undefined, longitude: undefined }]);
    const [transfer] = reconcileTransfers(
      [],
      [{ arrival: LANDING, stay: unlinked[0] }],
      () => undefined,
      () => 'key',
    );

    expect(transfer.placeId).toBeUndefined();
    expect(transfer.latitude).toBeUndefined();
  });

  it('交通卡片排在入住之前', () => {
    const [transfer] = reconcileTransfers([], [{ arrival: LANDING, stay: stays[0] }], () => undefined, () => 'k');

    expect(transfer.time < reachHotelTime(LANDING.time)!).toBe(true);
  });

  it('退房那張卡片有連結時也算數——兩張卡任一張連上就夠', () => {
    const linkedCheckout = staysFromItinerary([
      { ...checkInItem, placeId: undefined, latitude: undefined, longitude: undefined },
      { ...checkInItem, id: 'stay-2', date: '2026-10-07', time: '11:00', title: '退房 Kent Hotel Gwangalli by Kensington' },
    ]);

    expect(linkedCheckout[0].placeId).toBe('ChIJkent');
  });
});

describe('航班卡片的基本資訊', () => {
  it('標題與起訖都還在', () => {
    const transfer = airportTransferItem({
      id: 't', date: LANDING.date, departTime: '21:55',
      airportName: LANDING.airport, hotelName: 'Kent Hotel Gwangalli by Kensington',
    });

    expect(transfer.title).toBe('前往 Kent Hotel Gwangalli by Kensington');
    expect(transfer.location).toBe('金海國際機場 → Kent Hotel Gwangalli by Kensington');
  });
});
