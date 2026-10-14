/**
 * @vitest-environment jsdom
 *
 * 「住宿資訊要可以編輯」 — in the card, not only in the service. The failure this
 * guards is the obvious one: an edit that adds the new booking without taking
 * the old one away leaves the traveller with two.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StayUploadCard from '../components/StayUploadCard';
import { stayToItineraryItems } from '../services/stayIntake';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const booking = (over: Record<string, unknown> = {}) => {
  let n = 0;
  return stayToItineraryItems({
    hotelName: '朋友家',
    checkInDate: '2026-10-20',
    checkInTime: '23:23',
    checkOutDate: '2026-10-24',
    checkOutTime: '11:00',
    ...over,
  } as never, () => `stay-${n += 1}`) as unknown as ItineraryItem[];
};

const mount = (items: ItineraryItem[]) => {
  const onAddItems = vi.fn();
  const onRemoveItem = vi.fn();
  render(<StayUploadCard itinerary={items} onAddItems={onAddItems} onRemoveItem={onRemoveItem} />);
  return { onAddItems, onRemoveItem };
};

describe('editing a saved stay', () => {
  it('opens the form already filled in', () => {
    const items = booking();
    mount(items);

    fireEvent.click(screen.getByTestId(`edit-stay-${items[0].id}`));

    expect((screen.getByDisplayValue('朋友家') as HTMLInputElement).value).toBe('朋友家');
    expect(screen.getByDisplayValue('2026-10-20')).toBeTruthy();
    expect(screen.getByDisplayValue('23:23')).toBeTruthy();
    expect(screen.getByText('儲存修改')).toBeTruthy();
  });

  /** Both halves go, because both are rebuilt. */
  it('removes the whole old booking, not just the card that was tapped', async () => {
    const items = booking();
    const { onRemoveItem, onAddItems } = mount(items);

    fireEvent.click(screen.getByTestId(`edit-stay-${items[0].id}`));
    fireEvent.change(screen.getByDisplayValue('23:23'), { target: { value: '15:00' } });
    fireEvent.click(screen.getByText('儲存修改'));

    expect(onRemoveItem.mock.calls.map(call => call[0]).sort())
      .toEqual(items.map(item => item.id).sort());
    await waitFor(() => expect(onAddItems).toHaveBeenCalled());
  });

  it('saves the change that was typed', async () => {
    const items = booking();
    const { onAddItems } = mount(items);

    fireEvent.click(screen.getByTestId(`edit-stay-${items[0].id}`));
    fireEvent.change(screen.getByDisplayValue('23:23'), { target: { value: '15:00' } });
    fireEvent.click(screen.getByText('儲存修改'));

    await waitFor(() => expect(onAddItems).toHaveBeenCalled());
    const saved = onAddItems.mock.calls[0][0] as ItineraryItem[];
    expect(saved.find(item => item.title.startsWith('入住'))?.time).toBe('15:00');
  });

  /** Adding a new stay still adds, and removes nothing. */
  it('leaves 加入住宿 alone', () => {
    const { onRemoveItem } = mount(booking());

    fireEvent.click(screen.getByText('手動'));

    expect(screen.getByText('加入住宿')).toBeTruthy();
    expect(onRemoveItem).not.toHaveBeenCalled();
  });

  it('forgets the edit when cancelled', () => {
    const items = booking();
    const { onRemoveItem } = mount(items);

    fireEvent.click(screen.getByTestId(`edit-stay-${items[0].id}`));
    fireEvent.click(screen.getByText('取消'));
    fireEvent.click(screen.getByText('手動'));

    expect((screen.getByPlaceholderText(/海雲台/) as HTMLInputElement).value).toBe('');
    expect(onRemoveItem).not.toHaveBeenCalled();
  });
});
