/**
 * @vitest-environment jsdom
 *
 * The 地圖模式 button has been in the day header all along — styled, labelled,
 * and wired to nothing. These assert it now does something, and that the map
 * is drawn beside the list rather than instead of it: the list is where times
 * are dragged, retimed and ticked.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItineraryCalendar from '../components/ItineraryCalendar';
import DayMap from '../components/DayMap';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const DAY = '2026-10-20';

const stop = (id: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: DAY, time,
  latitude: 35.6595, longitude: 139.7005, ...over,
} as ItineraryItem);

describe('the 地圖模式 button', () => {
  it('shows the map when pressed, and says so', () => {
    render(<ItineraryCalendar items={[stop('羽田機場', '08:00'), stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    expect(screen.queryByTestId('day-map')).toBeNull();

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(screen.getByTestId('day-map')).toBeTruthy();
    expect(screen.getByTestId('toggle-map-mode').textContent).toContain('列表模式');
  });

  it('goes back', () => {
    render(<ItineraryCalendar items={[stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));
    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(screen.queryByTestId('day-map')).toBeNull();
  });

  /** The map is added, not substituted. */
  it('keeps the timeline underneath', () => {
    render(<ItineraryCalendar items={[stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(document.querySelector('[data-item-id="渋谷"]')).toBeTruthy();
  });
});

describe('the picture itself', () => {
  it('asks our own server, never Google, and carries no key', () => {
    render(<DayMap items={[stop('a', '09:00'), stop('b', '11:00')]} />);

    const src = screen.getByTestId('day-map-image').getAttribute('src') || '';

    expect(src.startsWith('/api/maps/day?')).toBe(true);
    expect(src).not.toContain('googleapis');
    expect(src.toLowerCase()).not.toContain('key=');
  });

  /*
    A day showing four pins for five stops is a day the traveller has to count
    twice, so the ones that could not be placed are stated rather than dropped.
  */
  it('says how many stops it could not place', () => {
    render(<DayMap items={[
      stop('a', '09:00'),
      stop('b', '11:00', { latitude: undefined, longitude: undefined }),
    ]} />);

    expect(screen.getByTestId('day-map-unmapped').textContent).toContain('1');
  });

  it('says nothing about missing pins when none are missing', () => {
    render(<DayMap items={[stop('a', '09:00')]} />);

    expect(screen.queryByTestId('day-map-unmapped')).toBeNull();
  });

  it('draws no map at all when nothing has coordinates', () => {
    render(<DayMap items={[stop('a', '09:00', { latitude: undefined, longitude: undefined })]} />);

    expect(screen.queryByTestId('day-map-image')).toBeNull();
    expect(screen.getByTestId('day-map-empty').textContent).toContain('還沒連結地圖');
  });

  /** A broken image with no explanation is the failure this avoids. */
  it('says so when the picture cannot be drawn', () => {
    render(<DayMap items={[stop('a', '09:00')]} />);

    fireEvent.error(screen.getByTestId('day-map-image'));

    expect(screen.getByTestId('day-map-failed').textContent).toContain('畫不出地圖');
  });
});

/**
 * 「雖地圖不能用但我希望我去點 1 的時候會出現地名」.
 *
 * The map is a PNG — the pins carry no events and nothing can be attached to
 * them. A numbered pin whose name appears nowhere on the screen is a riddle,
 * so the numbers are listed under it, which is what the Founder's own mock had.
 */
describe('which pin is which', () => {
  it('names every pin, with its number', () => {
    render(<DayMap items={[stop('羽田機場', '08:00'), stop('淺草寺', '12:00')]} />);

    const legend = screen.getByTestId('day-map-legend');

    expect(legend.textContent).toContain('1');
    expect(legend.textContent).toContain('羽田機場');
    expect(legend.textContent).toContain('2');
    expect(legend.textContent).toContain('淺草寺');
  });

  it('shows the time beside the name', () => {
    render(<DayMap items={[stop('淺草寺', '12:00')]} />);

    expect(screen.getByTestId('day-map-legend').textContent).toContain('12:00');
  });

  /*
    The numbers follow the day, not the drawable subset — the same rule the
    pins follow, because the two have to agree about what 2 means.
  */
  it('numbers by position in the day', () => {
    render(<DayMap items={[
      stop('a', '09:00'),
      stop('b', '10:00', { latitude: undefined, longitude: undefined }),
      stop('c', '11:00'),
    ]} />);

    const rows = screen.getByTestId('day-map-legend').querySelectorAll('button');

    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('3');
  });

  /** Tapping a row goes to the card, which is what the pin was reached for. */
  it('scrolls to the stop it names', () => {
    const scrollIntoView = vi.fn();
    render(
      <>
        <DayMap items={[stop('淺草寺', '12:00')]} />
        <div data-item-id="淺草寺" />
      </>,
    );
    const card = document.querySelector('[data-item-id="淺草寺"]') as HTMLElement;
    card.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByTestId('day-map-legend-淺草寺'));

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
