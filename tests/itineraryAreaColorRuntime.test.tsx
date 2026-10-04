/**
 * @vitest-environment jsdom
 *
 * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」.
 *
 * A day reads as a sequence of names — 梵魚寺, 汗蒸幕, 新世界百貨 — until
 * something says that two of them are the same afternoon and the third is
 * forty minutes away.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import ItineraryCalendar from '../components/ItineraryCalendar';
import { buildTripAreas } from '../services/tripAreas';

vi.mock('../services/placePhotoService', () => ({ fetchPlacePhoto: () => Promise.resolve(null) }));
vi.mock('../services/placeCommerceService', () => ({
  fetchPlaceCommerce: () => Promise.resolve(null),
  hasDisplayableCommerce: () => false,
}));
// Only the network calls are replaced: the transport leg between two stops
// renders here, and it reads labels and helpers from the same module.
vi.mock('../services/routesService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  estimateRoute: () => Promise.resolve(null),
  fetchRouteLeg: () => Promise.resolve(null),
}));

afterEach(cleanup);

const DAY = '2026-10-04';

const item = (id: string, location: string, latitude: number, longitude: number, address: string, time: string): ItineraryItem => ({
  id, title: location, location, notes: '', type: 'ACTIVITY', date: DAY, time,
  latitude, longitude, address, durationMinutes: 60,
} as ItineraryItem);

const itinerary = [
  item('it-market', '海雲台傳統市場', 35.1615, 129.1622, '22-1 Gunam-ro 41beon-gil, Haeundae, Busan', '09:00'),
  item('it-ant', '螞蟻家辣炒章魚', 35.1611, 129.1607, '34 Gunam-ro, Haeundae, Busan', '11:00'),
  item('it-temple', 'Beomeosa Temple', 35.2847, 129.0693, '250 Beomeosa-ro, Geumjeong-gu, Busan', '14:00'),
];

const renderCalendar = (items: ItineraryItem[] = itinerary, withAreas = true) => render(
  <ItineraryCalendar
    items={items}
    startDate={DAY}
    endDate={DAY}
    {...(withAreas ? { areas: buildTripAreas({ itinerary: items }) } : {})}
  />,
);

describe('an itinerary card', () => {
  it('says which area it is in', () => {
    renderCalendar();

    expect(screen.getByTestId('item-area-it-market').textContent).toContain('Haeundae');
    expect(screen.getByTestId('item-area-it-temple').textContent).toContain('Geumjeong-gu');
  });

  it('gives two stops in the same area the same colour', () => {
    renderCalendar();

    const market = screen.getByTestId('item-area-it-market').className;
    const ant = screen.getByTestId('item-area-it-ant').className;
    expect(market).toBe(ant);
  });

  it('gives a stop across the city a different one', () => {
    renderCalendar();

    expect(screen.getByTestId('item-area-it-temple').className)
      .not.toBe(screen.getByTestId('item-area-it-market').className);
  });

  it('says nothing about a card with no location', () => {
    renderCalendar([
      ...itinerary,
      { id: 'it-free', title: '自由活動', location: '', notes: '', type: 'ACTIVITY', date: DAY, time: '16:00' } as ItineraryItem,
    ]);

    expect(screen.queryByTestId('item-area-it-free')).toBeNull();
  });

  it('shows no area at all when none were worked out', () => {
    // The badge is an answer, and with nothing clustered there is no question
    // it could be answering.
    renderCalendar(itinerary, false);

    expect(screen.queryByTestId('item-area-it-market')).toBeNull();
  });
});
