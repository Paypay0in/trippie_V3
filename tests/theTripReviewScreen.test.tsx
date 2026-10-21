/**
 * @vitest-environment jsdom
 *
 * 旅程回顧 — the screen, across its three tabs.
 *
 * The tests that matter most here are the empty ones. A review is read long
 * after anybody can check it, so a section with nothing behind it has to say
 * so rather than fill itself: no stars for a stop nobody rated, no Top 3 for
 * a trip nobody rated at all, no footprint for an itinerary with no positions
 * in it, and no cover photograph that the traveller did not take.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripRecapScreen from '../components/TripRecapScreen';
import { Category, Expense, ItineraryItem, PaymentMethod } from '../types';

afterEach(cleanup);

const TODAY = '2026-10-21';

const stop = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: 'i1', time: '09:00', title: '淺草寺', location: '台東區', notes: '',
  type: 'ACTIVITY', date: '2026-10-18', latitude: 35.7148, longitude: 139.7967,
  ...over,
});

const bill = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', description: '黑船亭', amount: 4300, currency: 'JPY',
  exchangeRate: 0.22, twdAmount: 946, category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_FOREIGN, phase: 'during', date: '2026-10-18',
  payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
});

const open = (itinerary: ItineraryItem[], expenses: Expense[] = []) => render(
  <TripRecapScreen
    trip={{ name: '東京之旅', itinerary, travelCountry: '日本' }}
    expenses={expenses}
    today={TODAY}
    onBack={vi.fn()}
  />,
);

describe('總覽', () => {
  it('counts the days, the places, the meals and the money', () => {
    open(
      [
        stop({ id: 'a', date: '2026-10-18' }),
        stop({ id: 'b', date: '2026-10-19', title: '一蘭拉麵', type: 'FOOD' }),
      ],
      [bill(), bill({ id: 'e2', twdAmount: 1200 })],
    );

    expect(screen.getByTestId('recap-stat-旅行天數').textContent).toBe('2');
    expect(screen.getByTestId('recap-stat-造訪景點').textContent).toBe('1');
    expect(screen.getByTestId('recap-stat-餐廳美食').textContent).toBe('1');
    expect(screen.getByTestId('recap-stat-我的花費').textContent).toBe('NT$ 2,146');
  });

  it('draws the footprint from the stops that have a position', () => {
    open([stop()]);

    expect(screen.getByTestId('recap-footprint').getAttribute('src')).toContain('/api/maps/day?');
  });

  /* Nothing resolved to a position is nothing to draw, and it says that. */
  it('says so when no stop has a position', () => {
    open([stop({ latitude: undefined, longitude: undefined })]);

    expect(screen.queryByTestId('recap-footprint')).toBeNull();
    expect(screen.getByTestId('recap-footprint-empty').textContent).toContain('畫不出足跡');
  });

  it('lists the areas the trip went to', () => {
    open([stop({ id: 'a', address: '東京都台東区上野2-13-13' })]);

    expect(screen.getByTestId('recap-areas').textContent).toContain('個地點');
  });

  it('ranks the rated stops as 旅程亮點', () => {
    const rated = stop({ id: 'k', title: 'Kurofunetei', latitude: 35.71, longitude: 139.77 });
    open([rated], [bill({
      merchant: 'Kurofunetei', rating: 5,
      merchantLatitude: 35.71, merchantLongitude: 139.77,
    })]);

    expect(screen.getByTestId('recap-highlights').textContent).toContain('Kurofunetei');
    expect(screen.getByTestId('recap-highlight-stars-k').textContent).toBe('★★★★★');
  });

  /*
    Nothing rated must not become three arbitrary stops under a heading that
    says 亮點 — that invents the opinion. It points at where opinions come
    from instead.
  */
  it('asks for a rating rather than inventing a Top 3', () => {
    open([stop()]);

    expect(screen.queryByTestId('recap-highlights')).toBeNull();
    expect(screen.getByTestId('recap-highlights-empty').textContent).toContain('記帳時順手給個星等');
  });
});

/*
  The cover is the trip's own, shared with the header. 「目前是這樣喔」 — the
  app already pictures a trip, with a credited photograph, so a review that
  pictured it some other way would be the same thing done twice.
*/
describe('the cover', () => {
  it('wears the trip name and its dates', () => {
    open([stop({ date: '2026-10-18' }), stop({ id: 'b', date: '2026-10-20' })]);

    const cover = screen.getByTestId('recap-cover');
    expect(cover.textContent).toContain('東京之旅');
    expect(cover.textContent).toContain('10/18');
    expect(cover.textContent).toContain('10/20');
  });
});

describe('每日行程', () => {
  const goToDays = () => fireEvent.click(screen.getByTestId('recap-tab-days'));

  it('walks one day at a time', () => {
    open([
      stop({ id: 'a', date: '2026-10-18', title: '淺草寺' }),
      stop({ id: 'b', date: '2026-10-19', title: '新宿御苑' }),
    ]);
    goToDays();

    expect(screen.getByTestId('recap-day').textContent).toContain('第 1 天');
    expect(screen.getByTestId('recap-stop-a')).toBeTruthy();
    expect(screen.queryByTestId('recap-stop-b')).toBeNull();

    fireEvent.click(screen.getByTestId('recap-day-chip-2'));

    expect(screen.getByTestId('recap-stop-b')).toBeTruthy();
    expect(screen.queryByTestId('recap-stop-a')).toBeNull();
  });

  it('puts the day in clock order', () => {
    open([
      stop({ id: 'late', time: '18:30', title: '黑船亭' }),
      stop({ id: 'early', time: '09:00', title: '淺草寺' }),
    ]);
    goToDays();

    const titles = [...screen.getByTestId('recap-day').querySelectorAll('[data-testid^="recap-stop-"]')]
      .map(node => node.getAttribute('data-testid'));
    expect(titles).toEqual(['recap-stop-early', 'recap-stop-late']);
  });

  /* 「也能摘取這些紀錄」 — the note written at the till, on the day it was written. */
  it('carries the note and the stars off the bill', () => {
    const rated = stop({ id: 'k', title: 'Kurofunetei', latitude: 35.71, longitude: 139.77 });
    open([rated], [bill({
      merchant: 'Kurofunetei', rating: 4, note: '蘑菇義大利麵超好吃！',
      merchantLatitude: 35.71, merchantLongitude: 139.77,
    })]);
    goToDays();

    expect(screen.getByTestId('recap-stop-note-k').textContent).toContain('蘑菇義大利麵超好吃！');
    expect(screen.getByTestId('recap-stop-stars-k').textContent).toBe('★★★★');
  });

  it('shows no stars for a stop nobody rated', () => {
    open([stop()]);
    goToDays();

    expect(screen.queryByTestId('recap-stop-stars-i1')).toBeNull();
  });

  /*
    「淺草寺啊啥的 應該要讓我點擊可以寫下日記」 — a stop that costs nothing has
    no bill, so it had a grey pin and its name and nothing else.
  */
  it('lets a stop with no bill be written about', () => {
    const onWriteDiary = vi.fn();
    render(
      <TripRecapScreen
        trip={{ name: '東京之旅', itinerary: [stop()], travelCountry: '日本' }}
        expenses={[]}
        today={TODAY}
        onBack={vi.fn()}
        onWriteDiary={onWriteDiary}
      />,
    );
    fireEvent.click(screen.getByTestId('recap-tab-days'));
    fireEvent.click(screen.getByTestId('recap-diary-open-i1'));
    fireEvent.change(screen.getByTestId('recap-diary-input-i1'), { target: { value: '雷門比想像中大' } });
    fireEvent.click(screen.getByTestId('recap-diary-save-i1'));

    expect(onWriteDiary).toHaveBeenCalledWith('i1', '雷門比想像中大');
  });

  /* What was already written shows, and opens with that text in hand. */
  it('shows the diary already written against a stop', () => {
    render(
      <TripRecapScreen
        trip={{ name: '東京之旅', itinerary: [stop({ notes: '雷門比想像中大' })], travelCountry: '日本' }}
        expenses={[]}
        today={TODAY}
        onBack={vi.fn()}
        onWriteDiary={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('recap-tab-days'));

    expect(screen.getByTestId('recap-stop-diary-i1').textContent).toContain('雷門比想像中大');
    expect(screen.getByTestId('recap-diary-open-i1').textContent).toContain('編輯日記');
  });

  /* No way to write means no button offering to. */
  it('offers no diary when the caller cannot save one', () => {
    open([stop()]);
    fireEvent.click(screen.getByTestId('recap-tab-days'));

    expect(screen.queryByTestId('recap-diary-open-i1')).toBeNull();
  });

  it('says so when nothing was ever scheduled', () => {
    open([]);
    goToDays();

    expect(screen.getByTestId('recap-days-empty').textContent).toContain('還沒有排進任何一天');
  });
});

describe('我的精選', () => {
  const goToPicks = () => fireEvent.click(screen.getByTestId('recap-tab-picks'));

  it('names the best place and the best meal separately', () => {
    open(
      [
        stop({ id: 'temple', title: 'Sensoji', latitude: 35.71, longitude: 139.79 }),
        stop({ id: 'diner', title: 'Kurofunetei', type: 'FOOD', latitude: 35.72, longitude: 139.77 }),
      ],
      [
        bill({ id: 'b1', merchant: 'Sensoji', rating: 5, merchantLatitude: 35.71, merchantLongitude: 139.79 }),
        bill({ id: 'b2', merchant: 'Kurofunetei', rating: 4, merchantLatitude: 35.72, merchantLongitude: 139.77 }),
      ],
    );
    goToPicks();

    expect(screen.getByTestId('recap-pick-place').textContent).toContain('Sensoji');
    expect(screen.getByTestId('recap-pick-meal').textContent).toContain('Kurofunetei');
  });

  it('says what is missing rather than promoting an unrated stop', () => {
    open([stop()]);
    goToPicks();

    expect(screen.getByTestId('recap-pick-place-empty').textContent).toContain('還沒有評分過景點');
    expect(screen.getByTestId('recap-pick-meal-empty').textContent).toContain('還沒有評分過餐廳');
  });

  /*
    旅程小結 is counts, not prose. A paragraph about how the trip felt is the
    one thing nobody recorded, and a model writing it would put sentences in
    the traveller's mouth.
  */
  it('sums the trip up out of what was recorded', () => {
    open([stop()], [bill()]);
    goToPicks();

    const text = screen.getByTestId('recap-summary').textContent || '';
    expect(text).toContain('1 天的旅程');
    expect(text).toContain('NT$ 946');
  });
});
