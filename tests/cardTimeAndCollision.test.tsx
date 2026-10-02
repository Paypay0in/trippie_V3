/**
 * @vitest-environment jsdom
 *
 * 「拖曳時間不方便 另外為何有紅框」 — two complaints about the same card.
 *
 * The hour was reachable only by dragging in 30-minute steps or by opening the
 * edit sheet, and the red ring that appeared around two of his cards was drawn
 * nowhere explained. A mark nobody can read is not a warning.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItineraryCalendar from '../components/ItineraryCalendar';
import { ItineraryItem } from '../types';

const DAY = '2026-10-03';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '10:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: DAY, ...over,
});

/** His day 3: brunch with no stated duration, then Panier fifteen minutes later. */
const dayItems = [
  item({ id: 'brunch', time: '10:00', title: 'Working holiday 早午餐', type: 'FOOD' }),
  item({ id: 'panier', time: '10:15', title: 'Panier' }),
];

const calendar = (items = dayItems, onUpdateItem = vi.fn()) => {
  render(
    <ItineraryCalendar
      items={items}
      startDate={DAY}
      endDate={DAY}
      onUpdateItem={onUpdateItem}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      destination="釜山"
    />,
  );
  return onUpdateItem;
};

afterEach(cleanup);

describe('卡片上的時間', () => {
  it('是一個時間欄位，點下去就能改，不用拖曳', () => {
    calendar();

    const input = screen.getByTestId('time-input-brunch') as HTMLInputElement;
    expect(input.type).toBe('time');
    expect(input.value).toBe('10:00');
  });

  it('改了就直接寫回那個項目', () => {
    const onUpdateItem = calendar();

    // A native time picker hands back the whole value at once, which is what
    // this models; typing into it segment by segment is a desktop keyboard
    // behaviour and not what he is doing on a phone.
    fireEvent.change(screen.getByTestId('time-input-brunch'), { target: { value: '11:20' } });

    expect(onUpdateItem).toHaveBeenLastCalledWith('brunch', { time: '11:20' });
  });

  it('航班產生的卡片仍然唯讀——它的時間來自航班資訊', () => {
    calendar([item({ id: 'flight-landing-f1', time: '19:55', title: '航班抵達', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1' })]);

    expect(screen.queryByTestId('time-input-flight-landing-f1')).toBeNull();
  });
});

describe('紅框', () => {
  it('會說出自己是什麼意思', () => {
    calendar();

    expect(screen.getByTestId('collision-note-brunch')).toBeTruthy();
    expect(document.body.textContent).toContain('Panier');
  });

  it('沒填停留時間時，明講那是估算出來的，不是你排錯了', () => {
    calendar();

    expect(screen.getByTestId('collision-note-brunch').textContent).toContain('60 分鐘');
  });

  it('沒有重疊的一天完全不會出現紅框與說明', () => {
    calendar([dayItems[0], item({ id: 'later', time: '15:00', title: '甘川洞文化村' })]);

    expect(screen.queryByTestId('collision-note-brunch')).toBeNull();
  });
});
