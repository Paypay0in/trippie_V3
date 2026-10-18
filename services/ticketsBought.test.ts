/**
 * @vitest-environment jsdom
 *
 * 「並且像代辦清單 要可以打勾的」.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadBoughtTickets, toggleBoughtTicket, TICKETS_BOUGHT_STORAGE_KEY } from './ticketsBought';

beforeEach(() => localStorage.clear());

describe('已經買好的票', () => {
  it('survives a reload', () => {
    toggleBoughtTicket([], 'item-mot');

    expect(loadBoughtTickets()).toEqual(['item-mot']);
  });

  it('un-ticks', () => {
    const marked = toggleBoughtTicket([], 'item-mot');

    expect(toggleBoughtTicket(marked, 'item-mot')).toEqual([]);
    expect(loadBoughtTickets()).toEqual([]);
  });

  /* The same museum on two trips is two tickets, so the key is the item. */
  it('keeps two itinerary items apart', () => {
    const after = toggleBoughtTicket(toggleBoughtTicket([], 'tokyo-mot'), 'osaka-mot');

    expect(after).toEqual(['tokyo-mot', 'osaka-mot']);
  });

  it('reads nothing out of a corrupted store', () => {
    localStorage.setItem(TICKETS_BOUGHT_STORAGE_KEY, '{oops');

    expect(loadBoughtTickets()).toEqual([]);
  });

  it('ignores anything in there that is not an id', () => {
    localStorage.setItem(TICKETS_BOUGHT_STORAGE_KEY, JSON.stringify(['a', 7, null, '']));

    expect(loadBoughtTickets()).toEqual(['a']);
  });
});
