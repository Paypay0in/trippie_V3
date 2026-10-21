/**
 * @vitest-environment jsdom
 *
 * 「將總覽改成這樣」 — the overview opens on the place, with the ways out under
 * it.
 *
 * A tile is omitted rather than disabled when the caller has nowhere to send
 * it. A control that leads nowhere is the fourth kind of dead tap this screen
 * has produced tonight, and the cheapest one to never ship.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripLiveOverview from '../components/TripLiveOverview';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = (over: Record<string, unknown> = {}) => render(
  <TripLiveOverview
    expenses={[]}
    itinerary={[]}
    startDate="2026-10-20"
    endDate="2026-10-24"
    destination="Tokyo"
    onQuickAdd={vi.fn()}
    onOpenPlanning={vi.fn()}
    onOpenRecords={vi.fn()}
    {...over}
  />,
);

describe('the overview header', () => {
  it('names the place and the dates', () => {
    show();

    const hero = screen.getByTestId('trip-hero');
    expect(hero.textContent).toContain('Tokyo');
    expect(hero.textContent).toContain('2026/10/20 - 2026/10/24');
    expect(hero.textContent).toContain('旅行中');
  });
});

describe('the ways out', () => {
  it('always offers the plan', () => {
    show();

    expect(screen.getByTestId('trip-way-行程規劃')).toBeTruthy();
  });

  it('offers a companion list when there is one to open', () => {
    const onOpenCompanions = vi.fn();
    show({ onOpenCompanions });

    fireEvent.click(screen.getByTestId('trip-way-旅伴'));

    expect(onOpenCompanions).toHaveBeenCalled();
  });

  /* The rule this screen has earned the hard way. */
  it('leaves out the tiles with nowhere to go', () => {
    show();

    expect(screen.queryByTestId('trip-way-旅伴')).toBeNull();
    expect(screen.queryByTestId('trip-way-地圖')).toBeNull();
    expect(screen.queryByTestId('trip-way-購物清單')).toBeNull();
  });
});
