/**
 * 「為何有紅框」.
 *
 * On his day 3 the 10:00 brunch states no duration, so the app assumed an hour,
 * then ringed both that card and the 10:15 beside it in red — and said nothing
 * anywhere about why. He had to ask.
 *
 * An overlap between two stated durations is a fact about the plan. An overlap
 * that exists only because of an assumed hour is a fact about the app, and the
 * two should not wear the same unexplained red.
 */
import { describe, expect, it } from 'vitest';
import { describeCollision, DEFAULT_DURATION_MINUTES } from './itineraryTimeline';
import { ItineraryItem } from '../types';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '10:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: '2026-10-03', ...over,
});

/** His day, as the screenshot shows it. */
const brunch = item({ id: 'brunch', time: '10:00', title: 'Working holiday 早午餐', type: 'FOOD' });
const panier = item({ id: 'panier', time: '10:15', title: 'Panier' });

describe('說出紅框的理由', () => {
  it('沒填停留時間時，講明是「估算」造成的重疊，並說出估了多久', () => {
    const reason = describeCollision(brunch, [brunch, panier]);

    expect(reason).toContain(`${DEFAULT_DURATION_MINUTES} 分鐘`);
    expect(reason).toContain('Panier');
  });

  it('兩邊都有停留時間時，就直說時間重疊', () => {
    const stated = [
      item({ ...brunch, durationMinutes: 90 }),
      item({ ...panier, durationMinutes: 60 }),
    ];

    expect(describeCollision(stated[0], stated)).toBe('和「Panier」的時間重疊');
  });

  it('沒有重疊就什麼都不說', () => {
    const apart = [brunch, item({ ...panier, time: '14:00' })];

    expect(describeCollision(apart[0], apart)).toBeUndefined();
  });

  it('前後相接不算衝突——11:00 結束、11:00 開始是正常的安排', () => {
    const backToBack = [
      item({ id: 'a', time: '10:00', durationMinutes: 60, title: '早午餐' }),
      item({ id: 'b', time: '11:00', durationMinutes: 60, title: '咖啡' }),
    ];

    expect(describeCollision(backToBack[0], backToBack)).toBeUndefined();
  });

  it('沒有時間的項目不會被判定衝突', () => {
    const untimed = item({ id: 'untimed', time: '', title: '逛街' });

    expect(describeCollision(untimed, [untimed, brunch])).toBeUndefined();
  });
});
