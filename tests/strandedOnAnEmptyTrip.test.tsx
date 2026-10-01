/**
 * @vitest-environment jsdom
 *
 * 「我很生氣欸 你要趕快弄好啦」
 *
 * The last step left in a three-day sync failure was a tap only the second
 * traveller could make. Her phone reopened a 釜山 of her own — no dates, nothing
 * in it, existing only on that device — while the shared 釜山 holding 23 plans
 * and 3 bills sat beside it with the same name and the same cover. Every reload
 * put her back on the empty one and republished it.
 *
 * Where there is nothing to get wrong, the app decides: the open trip is empty,
 * it is on no server, and the account belongs to exactly one cloud trip.
 */
import { describe, expect, it } from 'vitest';
import { strandedLocalTripEscape } from '../services/strandedLocalTrip';
import type { TripDraft } from '../services/tripPersistence';

const HER_EMPTY = 'muobt0jqy9o6gn1h';
const SHARED = 'muo3ht39hl3hpfed';

const draft = (over: Partial<TripDraft>): TripDraft => ({
  id: 'x', name: '釜山', startDate: '', endDate: '',
  expenses: [], companions: [], shoppingList: [], itinerary: [],
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
  ...over,
} as TripDraft);

const herEmpty = draft({ id: HER_EMPTY });
const sharedRef = { id: SHARED, name: '釜山' };

describe('stranded on an empty local trip', () => {
  it('opens the one cloud trip instead', () => {
    expect(strandedLocalTripEscape(herEmpty, [sharedRef])).toEqual(sharedRef);
  });

  it('leaves a trip alone once there is anything in it', () => {
    const started = draft({ id: HER_EMPTY, itinerary: [{ id: 'i-1' }] as never });
    expect(strandedLocalTripEscape(started, [sharedRef])).toBeNull();

    const withBills = draft({ id: HER_EMPTY, expenses: [{ id: 'e-1' }] as never });
    expect(strandedLocalTripEscape(withBills, [sharedRef])).toBeNull();

    const dated = draft({ id: HER_EMPTY, startDate: '2026-10-02', endDate: '2026-10-07' });
    expect(strandedLocalTripEscape(dated, [sharedRef])).toBeNull();
  });

  it('does not move anyone who is already on a cloud trip', () => {
    const emptyButShared = draft({ id: SHARED });
    expect(strandedLocalTripEscape(emptyButShared, [sharedRef])).toBeNull();
  });

  it('refuses to guess when there is more than one cloud trip', () => {
    const two = [sharedRef, { id: 'another', name: '東京' }];
    expect(strandedLocalTripEscape(herEmpty, two)).toBeNull();
  });

  it('does nothing with no cloud trips and nothing open', () => {
    expect(strandedLocalTripEscape(herEmpty, [])).toBeNull();
    expect(strandedLocalTripEscape(undefined, [sharedRef])).toBeNull();
  });
});
