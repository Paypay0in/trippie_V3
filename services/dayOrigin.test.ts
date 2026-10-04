import { describe, expect, it } from 'vitest';
import { stayDepartedFrom, stayIsLocated } from './dayOrigin';
import { StaySpan } from './stayIntake';

const stay = (over: Partial<StaySpan> = {}): StaySpan => ({
  name: 'Lavender Hotel', itemId: 'hotel-1', nights: ['2026-10-03', '2026-10-04'],
  latitude: 35.1535, longitude: 129.1183, ...over,
});

describe('which hotel the day starts from', () => {
  it('is the one they slept in last night', () => {
    expect(stayDepartedFrom([stay()], '2026-10-04')?.name).toBe('Lavender Hotel');
  });

  it('still answers on the morning they check out', () => {
    // `stayForNight` says nothing on the check-out day — correctly, they have
    // no room that night. They do still leave from it that morning.
    expect(stayDepartedFrom([stay()], '2026-10-05')?.name).toBe('Lavender Hotel');
  });

  it('says nothing on the day they check in', () => {
    // They came from the airport, not from a room they had not reached. The
    // transfer card already covers that journey.
    expect(stayDepartedFrom([stay()], '2026-10-03')).toBeUndefined();
  });

  it('follows them when they change hotel mid-trip', () => {
    const first = stay({ name: '廣安里', nights: ['2026-10-03'] });
    const second = stay({ name: '海雲台', itemId: 'hotel-2', nights: ['2026-10-04', '2026-10-05'] });

    expect(stayDepartedFrom([first, second], '2026-10-04')?.name).toBe('廣安里');
    expect(stayDepartedFrom([first, second], '2026-10-05')?.name).toBe('海雲台');
  });

  it('says nothing for a stay with no dates, and nothing for no date', () => {
    expect(stayDepartedFrom([stay({ nights: [] })], '2026-10-04')).toBeUndefined();
    expect(stayDepartedFrom([stay()], '')).toBeUndefined();
  });
});

describe('whether the hotel can anchor a journey', () => {
  it('needs both coordinates', () => {
    expect(stayIsLocated(stay())).toBe(true);
    expect(stayIsLocated(stay({ latitude: undefined }))).toBe(false);
    expect(stayIsLocated(undefined)).toBe(false);
  });
});
