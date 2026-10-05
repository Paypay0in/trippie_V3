/**
 * @vitest-environment jsdom
 *
 * 「最後再確認行程時，可以一鍵點選AI確認當日行程的交通規劃是否順暢，提供的更改建議
 * 等」 — the fourth rule the itinerary was rebuilt around.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import DayTransportCheck from '../components/DayTransportCheck';

const routeMinutes = vi.fn<[], number | null>(() => 20);
/** Every departure time the component asked about. */
const departures: Array<string | undefined> = [];

vi.mock('../services/routesService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRouteLeg: vi.fn(async (_from, _to, _mode, departureTime?: string) => {
    departures.push(departureTime);
    const minutes = routeMinutes();
    return minutes === null
      ? { mode: 'TRANSIT', available: false }
      : { mode: 'TRANSIT', available: true, durationSeconds: minutes * 60 };
  }),
}));

const DAY = '2026-10-05';

const stop = (id: string, time: string, durationMinutes = 60): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: DAY, time, durationMinutes,
  latitude: 35.16, longitude: 129.16,
} as ItineraryItem);

beforeEach(() => { routeMinutes.mockReturnValue(20); departures.length = 0; });
afterEach(cleanup);

const renderCheck = (items: ItineraryItem[]) =>
  render(<DayTransportCheck date={DAY} items={items} />);

describe('the one-tap check', () => {
  it('says nothing to check when the day has no journey in it', () => {
    renderCheck([stop('市場', '10:00')]);

    expect(screen.queryByTestId('day-transport-check')).toBeNull();
  });

  it('checks nothing until it is tapped', () => {
    renderCheck([stop('市場', '10:00'), stop('咖啡', '13:00')]);

    expect(departures).toEqual([]);
    expect(screen.queryByTestId('transport-check-result')).toBeNull();
  });

  it('calls a day that works a day that works', async () => {
    const user = userEvent.setup();
    renderCheck([stop('市場', '10:00'), stop('咖啡', '13:00')]);

    await user.click(screen.getByTestId('run-transport-check'));

    expect((await screen.findByTestId('transport-check-result')).textContent).toContain('交通接得上');
  });

  it('names the leg that does not fit', async () => {
    // 市場 runs 10:00–11:00 and 咖啡 starts 11:15, so 15 minutes for a
    // 40-minute journey.
    routeMinutes.mockReturnValue(40);
    const user = userEvent.setup();
    renderCheck([stop('市場', '10:00'), stop('咖啡', '11:15')]);

    await user.click(screen.getByTestId('run-transport-check'));

    const finding = await screen.findByTestId('transport-finding-too_tight');

    expect(finding.textContent).toContain('市場');
    expect(finding.textContent).toContain('咖啡');
  });

  it('asks about the time they actually leave, not about now', async () => {
    // A transit route at 09:00 and the same route at 21:00 are different
    // journeys; checking tonight against this afternoon would be confidently
    // wrong.
    const user = userEvent.setup();
    renderCheck([stop('市場', '10:00', 90), stop('咖啡', '13:00')]);

    await user.click(screen.getByTestId('run-transport-check'));
    await screen.findByTestId('transport-check-result');

    expect(departures[0]).toContain(new Date(`${DAY}T11:30:00`).toISOString().slice(0, 13));
  });

  it('says how many legs it could not see', async () => {
    routeMinutes.mockReturnValue(null);
    const user = userEvent.setup();
    renderCheck([stop('市場', '10:00'), stop('咖啡', '13:00')]);

    await user.click(screen.getByTestId('run-transport-check'));

    expect((await screen.findByTestId('transport-finding-unknown_leg')).textContent).toContain('1 段');
  });
});
