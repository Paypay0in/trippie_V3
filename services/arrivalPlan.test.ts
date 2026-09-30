import { describe, expect, it } from 'vitest';
import {
  MINUTES_CLEARING_AIRPORT,
  airportTransferItem,
  departAirportTime,
  formatTravelDuration,
  reachHotelTime,
} from './arrivalPlan';

describe('departAirportTime', () => {
  it('allows two hours for immigration and baggage', () => {
    expect(MINUTES_CLEARING_AIRPORT).toBe(120);
    expect(departAirportTime('13:05')).toBe('15:05');
    expect(departAirportTime('08:30')).toBe('10:30');
  });

  it('stays on the arrival day rather than rolling past midnight', () => {
    // A 23:40 landing means leaving the airport that night. Pushing the card
    // to the next date would take it off the day they actually land on.
    expect(departAirportTime('23:40')).toBe('23:59');
  });

  it('refuses a time it cannot read instead of inventing one', () => {
    expect(departAirportTime('')).toBeNull();
    expect(departAirportTime('afternoon')).toBeNull();
  });
});

describe('reachHotelTime', () => {
  it('adds the journey on top of clearing the airport', () => {
    // Land 13:05, out by 15:05, 40 minutes to the hotel.
    expect(reachHotelTime('13:05', 40 * 60)).toBe('15:45');
  });

  it('rounds to the minute, since a route estimate is not accurate to seconds', () => {
    expect(reachHotelTime('10:00', 95)).toBe('12:02');
  });

  it('is just the airport-exit time when no route was found', () => {
    // Shifting check-in by a guessed journey would move it by an amount
    // nobody could check.
    expect(reachHotelTime('13:05')).toBe('15:05');
    expect(reachHotelTime('13:05', 0)).toBe('15:05');
  });

  it('stays inside the arrival day', () => {
    expect(reachHotelTime('22:30', 90 * 60)).toBe('23:59');
  });
});

describe('formatTravelDuration', () => {
  it('reads the way a traveller would say it', () => {
    expect(formatTravelDuration(45 * 60)).toBe('45 分');
    expect(formatTravelDuration(60 * 60)).toBe('1 小時');
    expect(formatTravelDuration(85 * 60)).toBe('1 小時 25 分');
  });

  it('never claims zero minutes for a real journey', () => {
    expect(formatTravelDuration(20)).toBe('1 分');
  });
});

describe('airportTransferItem', () => {
  const base = {
    id: 't1',
    date: '2026-10-02',
    departTime: '15:05',
    airportName: '金海國際機場',
    hotelName: '海雲台格蘭飯店',
  };

  it('names both ends and states the journey', () => {
    const item = airportTransferItem({ ...base, travelSeconds: 40 * 60 });
    expect(item).toMatchObject({ type: 'TRANSPORT', date: '2026-10-02', time: '15:05' });
    expect(item.title).toContain('海雲台格蘭飯店');
    expect(item.location).toBe('金海國際機場 → 海雲台格蘭飯店');
    expect(item.notes).toContain('40 分');
  });

  it('says the journey needs checking when no route was found', () => {
    expect(airportTransferItem(base).notes).toContain('請再確認');
    expect(airportTransferItem(base).notes).not.toMatch(/約 \d+ 分/);
  });

  it('calls a transit journey 大眾運輸, not 車程', () => {
    // South Korea publishes no driving routes, so every Busan transfer comes
    // back as transit. Calling 78 minutes of subway 車程 would send the
    // traveller looking for a taxi that does not exist.
    const transit = airportTransferItem({ ...base, travelSeconds: 78 * 60, mode: 'TRANSIT' });
    expect(transit.notes).toContain('大眾運輸約 1 小時 18 分');
    expect(transit.notes).not.toContain('車程');

    const driving = airportTransferItem({ ...base, travelSeconds: 40 * 60, mode: 'DRIVE' });
    expect(driving.notes).toContain('車程約 40 分');
  });

  it('is not fixed, because a recommendation is a starting point', () => {
    // The traveller may take a different train, share a taxi, or stop to eat.
    expect('scheduleFlexibility' in airportTransferItem(base)).toBe(false);
    expect('fixedEventKind' in airportTransferItem(base)).toBe(false);
  });
});
