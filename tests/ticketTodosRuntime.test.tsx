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

/**
 * 「這裡要能夠跳出購票連結 並且像代辦清單 要可以打勾的」.
 *
 * The list named the museums and stopped there, and there was no way to say
 * one was already bought — so three paid-for tickets sat looking outstanding.
 */
describe('買票連結與打勾', () => {
  const Links: React.FC<{ itinerary: ItineraryItem[] }> = ({ itinerary }) => {
    const todos = useTicketTodos(itinerary);
    return <ul data-testid="links">{todos.flatMap(todo =>
      (todo.bookingOptions || []).map(option => (
        <li key={option.url}>{option.label}・{option.urlType}・{option.url}</li>
      )))}</ul>;
  };

  it('carries the places to buy it through to the panel', async () => {
    commerceFor['ChIJ-sky'] = {
      admissionRequired: true,
      bookingOptions: [
        { provider: 'official', label: '官方網站', url: 'https://www.shibuya-scramble-square.com/sky/', urlType: 'direct' },
        { provider: 'klook', label: 'Klook', url: 'https://www.klook.com/zh-TW/search/?query=SHIBUYA%20SKY', urlType: 'search' },
      ],
    };

    render(<Links itinerary={[item('g', '澀谷 SKY', 'ChIJ-sky', '2026-10-24')]} />);

    await waitFor(() => expect(screen.getByTestId('links').children).toHaveLength(2));
    expect(screen.getByTestId('links').textContent).toContain('官方網站・direct');
    expect(screen.getByTestId('links').textContent).toContain('Klook・search');
  });

  /* A place nobody has curated still has to be listed; it just has no links. */
  it('still lists one with nowhere known to buy it', async () => {
    commerceFor['ChIJ-bare'] = { admissionRequired: true };

    render(<Links itinerary={[item('h', '某個要門票的地方', 'ChIJ-bare', '2026-10-24')]} />);

    await waitFor(() => expect(screen.getByTestId('links')).toBeTruthy());
    expect(screen.getByTestId('links').textContent).toBe('');
  });
});

/**
 * 「安排的餐廳 有需要預約的 要放入行前規劃的待辦清單中」.
 *
 * The list asked `admissionRequired` and nothing else, so a restaurant that
 * cannot be walked into — 予約制, 需事先訂位 — was invisible to the one panel
 * whose job is 「what still has to be done」. Nobody is admitted to a
 * restaurant; they are expected.
 */
describe('要訂位的餐廳', () => {
  const Kinds: React.FC<{ itinerary: ItineraryItem[] }> = ({ itinerary }) => {
    const todos = useTicketTodos(itinerary);
    return <ul data-testid="kinds">{todos.map(todo => (
      <li key={todo.itemId}>{todo.placeName}・{todo.kind}</li>
    ))}</ul>;
  };

  it('lists a restaurant that has to be booked ahead', async () => {
    commerceFor['ChIJ-sushi'] = { admissionRequired: false, advanceBookingRequired: true };

    render(<Kinds itinerary={[item('s', '鮨 さいとう', 'ChIJ-sushi', '2026-10-21')]} />);

    await waitFor(() => expect(screen.getByTestId('kinds').textContent).toContain('鮨 さいとう・booking'));
  });

  /* A ticket is still a ticket, and the two send somebody to different places. */
  it('keeps the two apart', async () => {
    commerceFor['ChIJ-mot2'] = { admissionRequired: true };

    render(<Kinds itinerary={[item('m', '東京都現代美術館', 'ChIJ-mot2', '2026-10-20')]} />);

    await waitFor(() => expect(screen.getByTestId('kinds').textContent).toContain('・ticket'));
  });

  /*
    Most restaurants have no curated entry at all. What knows is the note the
    traveller saved with the place, read by the same rule.
  */
  it('reads it out of the traveller’s own note', async () => {
    commerceFor['ChIJ-yakiniku'] = null;
    const withNote = {
      ...item('y', 'Yoroniku', 'ChIJ-yakiniku', '2026-10-22'),
      savedTravelNotes: [{ id: 'n1', text: '要先訂位，很難訂' }],
    } as unknown as ItineraryItem;

    render(<Kinds itinerary={[withNote]} />);

    await waitFor(() => expect(screen.getByTestId('kinds').textContent).toContain('Yoroniku・booking'));
  });

  /* 「可預約導覽」 is an option, not a requirement. */
  it('does not read a plain mention of booking as a requirement', async () => {
    commerceFor['ChIJ-cafe'] = null;
    const withNote = {
      ...item('c', 'Kissa Hitofushi', 'ChIJ-cafe', '2026-10-22'),
      savedTravelNotes: [{ id: 'n1', text: '可預約導覽' }],
    } as unknown as ItineraryItem;

    render(<Kinds itinerary={[withNote]} />);

    await waitFor(() => expect(screen.getByTestId('kinds')).toBeTruthy());
    expect(screen.getByTestId('kinds').textContent).toBe('');
  });

  /* A table nobody reserved is a table somebody else has. */
  it('puts the bookings above a ticket that can be bought at the door', async () => {
    commerceFor['ChIJ-door2'] = { admissionRequired: true };
    commerceFor['ChIJ-table'] = { admissionRequired: false, advanceBookingRequired: true };

    render(<Kinds itinerary={[
      item('d', '現場買得到', 'ChIJ-door2', '2026-10-20'),
      item('t', '要訂位', 'ChIJ-table', '2026-10-23'),
    ]} />);

    await waitFor(() => expect(screen.getByTestId('kinds').children).toHaveLength(2));
    expect(screen.getByTestId('kinds').children[0].textContent).toContain('要訂位');
  });
});
