/**
 * @vitest-environment jsdom
 *
 * 「行程表上若有需要訂門票的景點或活動 就要放在前面的待辦事項欄位」.
 *
 * The itinerary card has said 需購票 on 東京都現代美術館 for hours. 旅程準備度 —
 * the panel whose whole job is 「what still has to be done」 — counted only the
 * shopping list.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { clearPlaceCommerceCache } from '../services/placeCommerceService';
import { useTicketTodos } from '../components/useTicketTodos';
import type { ItineraryItem } from '../types';

const commerceFor: Record<string, unknown> = {};

beforeEach(() => {
  clearPlaceCommerceCache();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    return { ok: true, json: async () => ({ commerce: commerceFor[String(body.placeId)] ?? null }) };
  }) as never);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const item = (id: string, placeName: string, placeId: string | undefined, date: string): ItineraryItem => ({
  id, title: placeName, location: placeName, notes: '', type: 'ACTIVITY', date, time: '10:00', placeId,
} as ItineraryItem);

const Probe: React.FC<{ itinerary: ItineraryItem[] }> = ({ itinerary }) => {
  const todos = useTicketTodos(itinerary);
  return <ul data-testid="todos">{todos.map(todo => (
    <li key={todo.itemId}>{todo.placeName}{todo.advanceBookingRequired ? '・需提前買' : ''}</li>
  ))}</ul>;
};

describe('tickets on the to-do list', () => {
  it('lists a place on the plan that needs one', async () => {
    commerceFor['ChIJ-mot'] = { admissionRequired: true };

    render(<Probe itinerary={[item('a', '東京都現代美術館', 'ChIJ-mot', '2026-10-20')]} />);

    await waitFor(() => expect(screen.getByTestId('todos').textContent).toContain('東京都現代美術館'));
  });

  it('says which ones cannot be bought at the door', async () => {
    commerceFor['ChIJ-teamlab'] = { admissionRequired: true, advanceBookingRequired: true };

    render(<Probe itinerary={[item('b', 'teamLab', 'ChIJ-teamlab', '2026-10-21')]} />);

    await waitFor(() => expect(screen.getByTestId('todos').textContent).toContain('需提前買'));
  });

  /* A free place is not a thing to do before leaving. */
  it('says nothing about a place that needs no ticket', async () => {
    commerceFor['ChIJ-beach'] = { admissionRequired: false };

    render(<Probe itinerary={[item('c', '海雲台海水浴場', 'ChIJ-beach', '2026-10-20')]} />);

    await waitFor(() => expect(screen.getByTestId('todos')).toBeTruthy());
    expect(screen.getByTestId('todos').textContent).toBe('');
  });

  /* Nothing to ask about a stop that was never resolved. */
  it('asks nothing for an item with no place id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as never);

    render(<Probe itinerary={[item('d', '朋友推薦的店', undefined, '2026-10-20')]} />);

    await waitFor(() => expect(screen.getByTestId('todos')).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* The one that can actually be missed is read first. */
  it('puts the advance-booking ones at the top', async () => {
    commerceFor['ChIJ-door'] = { admissionRequired: true };
    commerceFor['ChIJ-ahead'] = { admissionRequired: true, advanceBookingRequired: true };

    render(<Probe itinerary={[
      item('e', '現場買得到', 'ChIJ-door', '2026-10-20'),
      item('f', '要先訂', 'ChIJ-ahead', '2026-10-23'),
    ]} />);

    await waitFor(() => expect(screen.getByTestId('todos').children).toHaveLength(2));
    expect(screen.getByTestId('todos').children[0].textContent).toContain('要先訂');
  });
});
