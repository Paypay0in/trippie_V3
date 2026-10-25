/**
 * @vitest-environment jsdom
 *
 * ⑧ 已儲存 and ⑨ 加入我的行程 — what a visitor does with somebody else's find.
 *
 * Two things are easy to get quietly wrong here: a day offered from the trip
 * that was selected a moment ago, and a credit that disappears on the way in.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import AddStopToTripSheet, { TripChoice, tripDayOptions } from '../components/AddStopToTripSheet';
import SavedConfirmationSheet from '../components/SavedConfirmationSheet';
import { stopToItineraryItem } from '../services/tripPublishing';
import { PublishedTripStop } from '../types';

const stop: PublishedTripStop = {
  id: 's1', time: '', title: 'Onibus Coffee', type: 'FOOD',
  location: '中目黑', notes: '某間黑咖啡他們的手沖，氣氛也很好',
};

const trip = (id: string, patch: Partial<TripChoice> = {}): TripChoice => ({
  id, name: '我的東京旅行', startDate: '2026-04-13', endDate: '2026-04-16', ...patch,
});

const sheet = (props: Partial<React.ComponentProps<typeof AddStopToTripSheet>> = {}) => {
  const handlers = { onAdd: vi.fn(), onClose: vi.fn() };
  render(
    <AddStopToTripSheet
      stop={stop}
      sourceLabel="來自 Ann 的東京咖啡地圖"
      trips={[trip('t1')]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('加入我的行程', () => {
  it('offers every day of the chosen trip', () => {
    expect(tripDayOptions(trip('t1')).map(day => day.label))
      .toEqual(['Day 1 (4/13)', 'Day 2 (4/14)', 'Day 3 (4/15)', 'Day 4 (4/16)']);
  });

  it('adds it to the chosen trip and day with the remark', async () => {
    const handlers = sheet();

    await userEvent.selectOptions(screen.getByTestId('add-stop-date'), '2026-04-15');
    await userEvent.type(screen.getByTestId('add-stop-remark'), '看起來很棒');
    await userEvent.click(screen.getByTestId('add-stop-confirm'));

    expect(handlers.onAdd).toHaveBeenCalledWith({
      tripId: 't1', date: '2026-04-15', remark: '看起來很棒',
    });
  });

  it('adds it undated when no day was chosen', async () => {
    const handlers = sheet();

    await userEvent.click(screen.getByTestId('add-stop-confirm'));

    expect(handlers.onAdd).toHaveBeenCalledWith({ tripId: 't1' });
  });

  /*
    A day belongs to the trip it came from. Switching trips with 4/15 still
    selected would put the stop on a date the new trip may not even span.
  */
  it('clears the day when the trip changes', async () => {
    const handlers = sheet({ trips: [trip('t1'), trip('t2', { name: '京都', startDate: '2026-07-01', endDate: '2026-07-03' })] });

    await userEvent.selectOptions(screen.getByTestId('add-stop-date'), '2026-04-15');
    await userEvent.selectOptions(screen.getByTestId('add-stop-trip'), 't2');
    await userEvent.click(screen.getByTestId('add-stop-confirm'));

    expect(handlers.onAdd).toHaveBeenCalledWith({ tripId: 't2' });
  });

  /* A dropdown of guessed dates is worse than saying there are none. */
  it('offers no day at all for a trip without dates', () => {
    sheet({ trips: [trip('t1', { startDate: '', endDate: '' })] });

    expect(screen.queryByTestId('add-stop-date')).toBeNull();
    expect(screen.getByTestId('add-stop-no-days').textContent).toContain('還沒有日期');
  });

  it('says so rather than offering a dead button with no trips', () => {
    sheet({ trips: [] });

    expect(screen.getByTestId('add-stop-no-trips').textContent).toContain('還沒有可以加入的行程');
    expect(screen.queryByTestId('add-stop-confirm')).toBeNull();
  });

  /* The credit is visible before it is saved, not only afterwards. */
  it('shows where the place came from', () => {
    sheet();

    expect(screen.getByTestId('add-stop-source').textContent).toContain('來自 Ann');
  });
});

describe('the item it produces', () => {
  const source = { ownerId: 'ann', destination: '東京', name: '東京 7 日旅行' };

  it('carries the place across with the owner words and the remark', () => {
    const item = stopToItineraryItem(stop, source, () => 'i1', '2026-04-15', '想去！');

    expect(item.title).toBe('Onibus Coffee');
    expect(item.date).toBe('2026-04-15');
    expect(item.notes).toContain('某間黑咖啡');
    expect(item.notes).toContain('想去！');
  });

  /*
    §8: the latest sharer's identity must never overwrite the original
    author's. The owner of the trip it came from is who gets the credit.
  */
  it('keeps who it came from', () => {
    const item = stopToItineraryItem(stop, source, () => 'i1');

    expect(item.sourceCreatorId).toBe('ann');
  });

  it('keeps a restaurant a restaurant', () => {
    expect(stopToItineraryItem(stop, source, () => 'i1').type).toBe('FOOD');
  });

  it('lands undated when no day was chosen', () => {
    expect(stopToItineraryItem(stop, source, () => 'i1').date).toBeUndefined();
  });
});

describe('已儲存', () => {
  it('states how many it saved and where from', () => {
    render(
      <SavedConfirmationSheet
        savedCount={35}
        title="東京咖啡地圖"
        sourceLabel="來自 Ann 的公開收藏"
        onKeepBrowsing={vi.fn()}
      />,
    );

    const said = screen.getByTestId('saved-confirmation-count').textContent ?? '';
    expect(said).toContain('35 個地點');
    expect(said).toContain('來自 Ann');
  });

  /*
    The whole thing is saved first and picking is offered after: a visitor who
    wanted everything is done in one tap, and one who wanted three has not
    lost the other thirty-two.
  */
  it('offers picking a few afterwards', async () => {
    const onPickSome = vi.fn();
    render(
      <SavedConfirmationSheet
        savedCount={35}
        title="東京咖啡地圖"
        onKeepBrowsing={vi.fn()}
        onPickSome={onPickSome}
      />,
    );

    await userEvent.click(screen.getByTestId('saved-confirmation-pick'));

    expect(onPickSome).toHaveBeenCalled();
  });
});
