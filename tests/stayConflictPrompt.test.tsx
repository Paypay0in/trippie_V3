/**
 * @vitest-environment jsdom
 *
 * 「住房資訊重複了好幾個，要自動 pop up 詢問用戶哪個是正確的」.
 *
 * The service knows which cards contradict each other; this is about whether
 * the traveller is actually asked. A duplicate he cannot see is a duplicate he
 * will act on in Busan.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import StayUploadCard from '../components/StayUploadCard';
import { ItineraryItem } from '../types';

const stay = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 's', time: '21:55', title: '', location: '', notes: '', type: 'HOTEL',
  date: '2026-10-02', fixedEventKind: 'accommodation', ...over,
});

/** His four cards for one room. */
const duplicated = [
  stay({ id: 'in-kent-1', title: '入住 Kent Hotel Gwangalli by Kensington' }),
  stay({ id: 'in-kent-2', title: '入住 Kent Hotel Gwangalli by Kensington' }),
  stay({ id: 'out-cn', date: '2026-10-07', time: '11:00', title: '退房 廣安里凱星頓特酒店' }),
  stay({ id: 'out-kent', date: '2026-10-07', time: '11:00', title: '退房 Kent Hotel Gwangalli by Kensington' }),
];

const card = (itinerary: ItineraryItem[], onRemoveItem = vi.fn()) => {
  render(
    <StayUploadCard itinerary={itinerary} onAddItems={vi.fn()} onRemoveItem={onRemoveItem} />,
  );
  return onRemoveItem;
};

afterEach(cleanup);

describe('住宿重複時', () => {
  it('不用按任何東西就問出來', () => {
    card(duplicated);

    expect(screen.getByTestId('stay-conflict-prompt')).toBeTruthy();
    expect(screen.getByText('同一天有多筆住宿，哪一個才對？')).toBeTruthy();
  });

  it('兩個名字都列出來讓人選，而不是替他決定', () => {
    card(duplicated);

    expect(screen.getByText('廣安里凱星頓特酒店')).toBeTruthy();
    expect(screen.getByText('Kent Hotel Gwangalli by Kensington')).toBeTruthy();
  });

  it('選一個之後，另一間和重複的副本都被刪掉', async () => {
    const onRemoveItem = card(duplicated);
    const user = userEvent.setup();

    await user.click(screen.getByText('Kent Hotel Gwangalli by Kensington'));

    expect(onRemoveItem.mock.calls.map(call => call[0]).sort()).toEqual(['in-kent-2', 'out-cn']);
  });

  it('真的住兩間時可以全部保留，問題就不再擋著', async () => {
    const onRemoveItem = card(duplicated);
    const user = userEvent.setup();

    await user.click(screen.getByText('兩間都要住，全部保留'));

    expect(screen.queryByTestId('stay-conflict-prompt')).toBeNull();
    expect(onRemoveItem).not.toHaveBeenCalled();
  });

  it('沒有重複時完全不出現', () => {
    card([duplicated[0], duplicated[3]]);

    expect(screen.queryByTestId('stay-conflict-prompt')).toBeNull();
  });
});
