/**
 * @vitest-environment jsdom
 *
 * What a stored itinerary becomes when it is read back.
 *
 * Normalisation on read is where an old record stops being wrong: a change to
 * what an item may contain only reaches data saved before it if this function
 * applies it. Otherwise the fix works for everything added afterwards and
 * leaves the traveller's actual trip in the old state.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readDraftStore, writeDraftStore, TripDraft } from './tripPersistence';

const storedTrip = (itinerary: unknown[]): TripDraft => ({
  id: 'trip',
  name: '釜山',
  startDate: '2026-10-02',
  endDate: '2026-10-07',
  expenses: [],
  companions: [],
  shoppingList: [],
  itinerary,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as TripDraft);

const readItinerary = () => readDraftStore().drafts[0].itinerary || [];

beforeEach(() => localStorage.clear());

describe('a stay saved before stays stopped being fixed', () => {
  beforeEach(() => {
    writeDraftStore([storedTrip([
      {
        id: 'stay-in', time: '15:00', title: '入住 廣安里凱星頓特酒店',
        location: '廣安里', notes: '', type: 'HOTEL',
        scheduleFlexibility: 'fixed', fixedEventKind: 'accommodation',
      },
      {
        id: 'flight', time: '16:35', title: '航班起飛',
        location: '桃園', notes: '', type: 'FLIGHT',
        scheduleFlexibility: 'fixed', fixedEventKind: 'flight',
      },
    ])], 'trip');
  });

  it('reads as flexible, so an old itinerary stops being wrong on open', () => {
    // Stays were marked fixed when first built. That locked the one card whose
    // hour is genuinely negotiable: the check-in could not be moved, and it was
    // reported as conflicting with the flight that brought them there.
    expect(readItinerary().find(item => item.id === 'stay-in')?.scheduleFlexibility).toBeUndefined();
  });

  it('leaves the flight beside it fixed', () => {
    // Otherwise this would read as "nothing is a constraint any more".
    expect(readItinerary().find(item => item.id === 'flight')?.scheduleFlexibility).toBe('fixed');
  });

  it('keeps the accommodation marker, which is what identifies the card', () => {
    // The banner, the detail sheet and the stay list all find these by it.
    expect(readItinerary().find(item => item.id === 'stay-in')?.fixedEventKind).toBe('accommodation');
  });
});

describe('unrecognised values read as flexible', () => {
  it('drops a constraint nobody ships', () => {
    writeDraftStore([storedTrip([
      { id: 'a', time: '10:00', title: '景點', location: '', notes: '', type: 'ACTIVITY', scheduleFlexibility: 'immovable' },
      { id: 'b', time: '11:00', title: '景點', location: '', notes: '', type: 'ACTIVITY', fixedEventKind: 'moon_landing' },
    ])], 'trip');

    const items = readItinerary();
    expect(items.find(item => item.id === 'a')?.scheduleFlexibility).toBeUndefined();
    expect(items.find(item => item.id === 'b')?.fixedEventKind).toBeUndefined();
  });
});
