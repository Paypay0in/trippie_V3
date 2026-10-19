/**
 * @vitest-environment jsdom
 *
 * 「這個結果不能在這個介面就點擊套用嗎」.
 *
 * 換一天會更順 told the traveller which stop belongs on another day and then
 * said 「要的話自己拖過去」 — a correct instruction that costs a drag across a
 * day tab for something this panel had already worked out.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ItineraryCalendar from '../components/ItineraryCalendar';
import { betterOnAnotherDay } from '../services/betterOnAnotherDay';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const at = (id: string, date: string, time: string, lat: number, lng: number): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date, time,
  durationMinutes: 60, latitude: lat, longitude: lng,
} as ItineraryItem);

/* 淺草 on day one with an outlier in 渋谷; day two is entirely 渋谷. */
const items = [
  at('淺草寺', '2026-10-20', '10:00', 35.7148, 139.7967),
  at('晴空塔', '2026-10-20', '12:00', 35.7101, 139.8107),
  at('渋谷 SKY', '2026-10-20', '15:00', 35.6580, 139.7016),
  at('表參道', '2026-10-21', '10:00', 35.6652, 139.7126),
  at('代官山', '2026-10-21', '13:00', 35.6487, 139.7030),
];

const open = async (over: Record<string, unknown> = {}) => {
  const onReorder = vi.fn(() => true);
  const user = userEvent.setup();
  render(
    <ItineraryCalendar
      items={items}
      startDate="2026-10-20"
      endDate="2026-10-21"
      onReorder={onReorder}
      /* 優化動線 is only drawn where the plan can be written. */
      onUpdateItem={vi.fn()}
      {...over}
    />,
  );
  await user.click(screen.getByTestId('optimise-route'));
  return { onReorder, user };
};

describe('換一天會更順，可以直接按', () => {
  /* The fixture has to actually produce one, or the rest is theatre. */
  it('has a suggestion to offer', () => {
    expect(betterOnAnotherDay(items).length).toBeGreaterThan(0);
  });

  it('offers the move on the row that suggests it', async () => {
    await open();
    const [move] = betterOnAnotherDay(items);

    expect(screen.getByTestId(`move-to-day-${move.itemId}`).textContent)
      .toContain(move.toDate.slice(5).replace('-', '/'));
  });

  it('moves it with the same call the drag makes', async () => {
    const { onReorder, user } = await open();
    const [move] = betterOnAnotherDay(items);

    await user.click(screen.getByTestId(`move-to-day-${move.itemId}`));

    expect(onReorder).toHaveBeenCalledWith(move.itemId, { toDate: move.toDate });
  });

  it('takes the row away once it is done', async () => {
    const { user } = await open();
    const [move] = betterOnAnotherDay(items);

    await user.click(screen.getByTestId(`move-to-day-${move.itemId}`));

    expect(screen.queryByTestId(`move-to-day-${move.itemId}`)).toBeNull();
  });

  /* A write that was refused leaves the offer standing. */
  it('keeps the row when the move was rejected', async () => {
    const { user } = await open({ onReorder: vi.fn(() => false) });
    const [move] = betterOnAnotherDay(items);

    await user.click(screen.getByTestId(`move-to-day-${move.itemId}`));

    expect(screen.getByTestId(`move-to-day-${move.itemId}`)).toBeTruthy();
  });

  /* A screen that cannot write the move must not appear to offer it. */
  it('offers nothing when the caller cannot move anything', async () => {
    const user = userEvent.setup();
    render(<ItineraryCalendar
      items={items}
      startDate="2026-10-20"
      endDate="2026-10-21"
      onUpdateItem={vi.fn()}
    />);
    await user.click(screen.getByTestId('optimise-route'));
    const [move] = betterOnAnotherDay(items);

    expect(screen.queryByTestId(`move-to-day-${move.itemId}`)).toBeNull();
    expect(screen.getByTestId('better-on-another-day').textContent).toContain('自己拖過去');
  });
});
