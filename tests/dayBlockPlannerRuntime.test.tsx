/**
 * @vitest-environment jsdom
 *
 * 「可以接畫面 因為我們根本無法用行程表的這個功能」.
 *
 * The day is built by filling blocks rather than by placing times. Nothing new
 * is stored: a filled block *is* an itinerary item, and an empty one is a shape
 * that has not been filled yet — a second store of 「the day's blocks」 would be
 * a second answer to 「what is at 14:00」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import DayBlockPlanner from '../components/DayBlockPlanner';
import { buildTripAreas } from '../services/tripAreas';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const DAY = '2026-10-06';

const item = (id: string, location: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: location, location, notes: '', type: 'ACTIVITY', date: DAY, time,
  durationMinutes: 120, ...over,
} as ItineraryItem);

const gwangalli = [
  item('it-nasari', 'Nasari Sigdang', '10:00', {
    latitude: 35.1535, longitude: 129.1190, address: 'Suyeong-gu, Gwangan-ro 61beon-gil, Busan',
  }),
];

const places = [
  { id: 'g-working', placeName: 'Working holiday', areaLabel: 'Suyeong-gu', areaColorIndex: 0 },
  { id: 'g-diart', placeName: 'DIART coffee', areaLabel: 'Haeundae', areaColorIndex: 1 },
  { id: 'g-done', placeName: '海雲台傳統市場', areaLabel: 'Haeundae', areaColorIndex: 1, alreadyPlanned: true },
];

const renderPlanner = (over: Record<string, unknown> = {}) => {
  const onFillBlock = vi.fn();
  const onChangeDuration = vi.fn();
  render(
    <DayBlockPlanner
      date={DAY}
      items={gwangalli}
      places={places}
      areas={buildTripAreas({ itinerary: gwangalli })}
      onFillBlock={onFillBlock}
      onChangeDuration={onChangeDuration}
      {...over}
    />,
  );
  return { onFillBlock, onChangeDuration };
};

describe('the day as blocks', () => {
  it('shows the day in two-hour blocks from the first item', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-0').textContent).toContain('10:00–12:00');
    expect(screen.getByTestId('day-block-1').textContent).toContain('12:00–14:00');
  });

  it('names the midday block 午餐', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-1').textContent).toContain('午餐');
  });

  it('shows what is already in a block instead of a dropdown', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-0').textContent).toContain('Nasari Sigdang');
    expect(screen.queryByTestId('fill-block-0')).toBeNull();
  });

  it('offers the saved places in an empty block', () => {
    renderPlanner();

    expect(screen.getByTestId('fill-block-1').textContent).toContain('Working holiday');
  });

  it('puts the places in today’s area first', () => {
    // The point of the dropdown is a day that stays in one place, so the places
    // that would do that are the ones to reach first.
    renderPlanner();

    const options = Array.from(screen.getByTestId('fill-block-1').querySelectorAll('option'))
      .map(option => option.textContent || '');
    expect(options[1]).toContain('Working holiday');
  });

  it('greys out a place already on the plan', () => {
    renderPlanner();

    const option = Array.from(screen.getByTestId('fill-block-1').querySelectorAll('option'))
      .find(entry => (entry.textContent || '').includes('海雲台傳統市場'));
    expect((option as HTMLOptionElement).disabled).toBe(true);
  });

  it('fills a block with the block’s own time and length', async () => {
    const user = userEvent.setup();
    const { onFillBlock } = renderPlanner();

    await user.selectOptions(screen.getByTestId('fill-block-1'), 'g-working');

    expect(onFillBlock).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: '12:00', durationMinutes: 120 }),
      'g-working',
    );
  });
});

describe('a block’s length', () => {
  it('can be changed on a placed item', async () => {
    const user = userEvent.setup();
    const { onChangeDuration } = renderPlanner();

    await user.selectOptions(screen.getByTestId('block-duration-0'), '180');

    expect(onChangeDuration).toHaveBeenCalledWith('it-nasari', 180);
  });

  it('moves every later block with it', () => {
    // 「後來的行程就都要自動提前或順延」.
    renderPlanner({ items: [item('it-nasari', 'Nasari Sigdang', '10:00', { durationMinutes: 180 })] });

    expect(screen.getByTestId('day-block-1').textContent).toContain('13:00–15:00');
  });

  it('is never offered on a flight', () => {
    // 「航班時間是固定的行程」, and a length control on one invites breaking the
    // thing the day is built around.
    renderPlanner({
      items: [item('it-flight', '航班起飛', '10:00')],
      isFixed: () => true,
    });

    expect(screen.queryByTestId('block-duration-0')).toBeNull();
    expect(screen.getByTestId('day-block-0').textContent).toContain('固定');
  });
});

describe('what the day adds up to', () => {
  it('says which areas it touches', () => {
    renderPlanner();

    expect(screen.getByTestId('day-area-spread').textContent).toContain('Suyeong-gu');
  });

  it('says nothing about a day with no flights left to plan around', () => {
    renderPlanner({
      items: [],
      fixedSchedule: [{ date: DAY, time: '20:00', durationMinutes: 60, label: '航班抵達', role: 'landing' }],
    });

    expect(screen.queryByTestId('day-block-0')).toBeNull();
    expect(screen.getByText(/航班佔掉了/)).toBeTruthy();
  });
});
