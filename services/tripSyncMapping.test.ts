import { describe, expect, it } from 'vitest';
import { Category, Expense, FlightAnchor, ItineraryItem, PaymentMethod, ShoppingItem, TripMember } from '../types';
import {
  fromShoppingRow,
  toShoppingRow,
  ExpenseRow,
  fromExpenseRow,
  fromItineraryRow,
  fromMemberRow,
  toItineraryRow,
  toExpenseRow,
  toMemberRow,
  flightModeFromAnchors,
  fromFlightAnchorRow,
  toFlightAnchorRow,
} from './tripSyncMapping';

const TRIP = 'trip-1';
const ANN = `${TRIP}:owner`;
const GINA = 'member-gina';

const expense: Expense = {
  id: 'expense-1',
  description: '晚餐',
  amount: 3000,
  currency: 'TWD',
  exchangeRate: 1,
  handlingFee: 0,
  twdAmount: 3000,
  category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-09-15',
  createdByMemberId: ANN,
  payerId: ANN,
  payerAllocations: { [ANN]: 3000 },
  beneficiaries: [ANN, GINA],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  disputes: [],
  needsReview: false,
};

describe('expense mapping', () => {
  it('survives a round trip without losing a field', () => {
    const restored = fromExpenseRow(toExpenseRow(expense, TRIP));
    // Receipts default to none rather than undefined, so a row written before
    // the column existed reads back as an expense with no photos.
    expect(restored).toEqual({ ...expense, linkedShoppingItemId: undefined, receiptPhotos: [] });
  });

  /**
   * 「帳目中可以新增照片 剛點擊沒有反應」. The receipt has to reach the other phone;
   * a photo that only exists on the device that took it is not evidence either
   * traveller can settle from.
   */
  it('carries receipts to the other traveller', () => {
    const withReceipt: Expense = { ...expense, receiptPhotos: ['data:image/jpeg;base64,AAAA'] };

    expect(fromExpenseRow(toExpenseRow(withReceipt, TRIP)).receiptPhotos).toEqual(['data:image/jpeg;base64,AAAA']);
  });

  it('carries the split intact, including a dispute thread', () => {
    const withDispute: Expense = {
      ...expense,
      splitMethod: 'EXACT',
      splitAllocations: { [ANN]: 2000, [GINA]: 1000 },
      disputes: [
        {
          id: 'd1',
          raisedByMemberId: GINA,
          message: '我只用到 1000',
          status: 'open',
          createdAt: '2026-09-15T10:00:00.000Z',
          proposal: {
            changes: { amount: 2500 },
            basedOn: { amount: 3000 },
          },
        },
      ],
    };

    const restored = fromExpenseRow(toExpenseRow(withDispute, TRIP));
    expect(restored.splitAllocations).toEqual({ [ANN]: 2000, [GINA]: 1000 });
    expect(restored.disputes?.[0].proposal?.changes).toEqual({ amount: 2500 });
  });

  it('keeps a foreign-currency expense arithmetically intact', () => {
    const foreign: Expense = {
      ...expense,
      amount: 100,
      currency: 'JPY',
      exchangeRate: 0.22,
      handlingFee: 30,
      twdAmount: 52,
    };
    const restored = fromExpenseRow(toExpenseRow(foreign, TRIP));
    expect(restored.amount).toBe(100);
    expect(restored.exchangeRate).toBe(0.22);
    expect(restored.handlingFee).toBe(30);
    expect(restored.twdAmount).toBe(52);
  });

  it('defaults a sparse row rather than producing undefined split fields', () => {
    // A row written by an older client, or by hand. Leaving these undefined
    // would make the calculator treat the expense as shared by nobody.
    const sparse = {
      id: 'expense-2',
      trip_id: TRIP,
      created_by_member_id: null,
      description: '',
      amount: 500,
      currency: 'TWD',
      exchange_rate: 1,
      handling_fee: 0,
      twd_amount: 500,
      category: null,
      payment_method: null,
      phase: null,
      date: null,
      payer_id: null,
      payer_allocations: {},
      beneficiaries: [],
      split_method: 'EQUAL',
      split_allocations: {},
      disputes: [],
      needs_review: false,
      linked_shopping_item_id: null,
    } as ExpenseRow;

    const restored = fromExpenseRow(sparse);
    expect(restored.beneficiaries).toEqual([]);
    expect(restored.splitAllocations).toEqual({});
    expect(restored.payerAllocations).toEqual({});
    expect(restored.disputes).toEqual([]);
    expect(restored.splitMethod).toBe('EQUAL');
    expect(restored.createdByMemberId).toBeUndefined();
  });

  it('survives nulls where the database allows them', () => {
    const nulled = {
      ...toExpenseRow(expense, TRIP),
      beneficiaries: null as unknown as string[],
      split_allocations: null as unknown as Record<string, number>,
      disputes: null as unknown as unknown[],
    };
    const restored = fromExpenseRow(nulled);
    expect(restored.beneficiaries).toEqual([]);
    expect(restored.splitAllocations).toEqual({});
    expect(restored.disputes).toEqual([]);
  });

  it('writes the trip id onto the row', () => {
    expect(toExpenseRow(expense, 'trip-9').trip_id).toBe('trip-9');
  });
});

describe('member mapping', () => {
  it('round-trips a linked member and a name-only guest', () => {
    const linked: TripMember = { id: GINA, name: 'Gina', userId: 'user-gina', type: 'member' };
    const guest: TripMember = { id: 'member-bob', name: 'Bob', type: 'guest' };

    // The write shape may omit user_id; what comes back from the database
    // always has the column, so the read is given the stored value.
    const stored = (member: TripMember) => ({
      ...toMemberRow(member, TRIP),
      user_id: member.userId ?? null,
    });

    expect(fromMemberRow(stored(linked))).toEqual(linked);
    expect(fromMemberRow(stored(guest))).toEqual({
      ...guest,
      userId: undefined,
    });
  });

  it('leaves user_id out entirely when this device does not know it', () => {
    // Absent and null are different in an upsert. That column is what
    // is_trip_member reads, and it is written by the friend claiming her
    // invite on her own phone — so sending null from a device that has not
    // re-read since would blank it and revoke her access to the whole trip.
    // Omitting the column keeps whatever the server already has, and still
    // leaves a genuine guest with no account attached.
    const row = toMemberRow({ id: 'member-bob', name: 'Bob', type: 'guest' }, TRIP);
    expect('user_id' in row).toBe(false);
  });

  it('still sends the account when there is one', () => {
    const row = toMemberRow({ id: 'member-gina', name: 'Gina', type: 'member', userId: 'auth-1' }, TRIP);
    expect(row.user_id).toBe('auth-1');
  });
});

describe('itinerary rows', () => {
  const item: ItineraryItem = {
    id: 'it-1',
    time: '09:00',
    title: '甘川文化村',
    location: '甘川文化村',
    notes: '早上人少',
    type: 'ACTIVITY',
    date: '2026-10-03',
    placeId: 'place-gamcheon',
    latitude: 35.0975,
    longitude: 129.0107,
    durationMinutes: 90,
    isPinned: true,
    scheduleFlexibility: 'fixed',
    sortOrder: 0,
    sourceInspirationIds: ['insp-1'],
  };

  it('survives the round trip with everything that decides behaviour', () => {
    const back = fromItineraryRow(toItineraryRow(item, 'trip-1'));

    // Pinned is the one that matters most: it is a promise that the other
    // person's AI planner will not move this, so it has to travel.
    expect(back.isPinned).toBe(true);
    expect(back.scheduleFlexibility).toBe('fixed');
    expect(back.sortOrder).toBe(0);
    expect(back.date).toBe('2026-10-03');
    expect(back.placeId).toBe('place-gamcheon');
    expect(back.sourceInspirationIds).toEqual(['insp-1']);
  });

  it('keeps an unscheduled item unscheduled', () => {
    // '' and null both mean no day, and the difference must not turn into a
    // day of its own on the way back.
    const undated = fromItineraryRow(toItineraryRow({ ...item, date: undefined }, 'trip-1'));
    expect(undated.date).toBeUndefined();
  });

  it('tells "first in the day" apart from "no order set"', () => {
    // sortOrder 0 is a real position. Storing it as null would silently move
    // the item someone dragged to the top back into clock order.
    expect(toItineraryRow({ ...item, sortOrder: 0 }, 'trip-1').sort_order).toBe(0);
    expect(toItineraryRow({ ...item, sortOrder: undefined }, 'trip-1').sort_order).toBeNull();
    expect(fromItineraryRow(toItineraryRow({ ...item, sortOrder: 0 }, 'trip-1')).sortOrder).toBe(0);
  });

  it('falls back rather than trusting an unknown type from an older client', () => {
    const row = { ...toItineraryRow(item, 'trip-1'), type: 'SOMETHING_NEW' };
    expect(fromItineraryRow(row).type).toBe('ACTIVITY');
  });

  it('reads a row written before the JSONB columns had anything in them', () => {
    const row = { ...toItineraryRow(item, 'trip-1'), source_inspiration_ids: null, saved_travel_notes: null };
    expect(fromItineraryRow(row).sourceInspirationIds).toBeUndefined();
    expect(fromItineraryRow(row).savedTravelNotes).toBeUndefined();
  });
});

describe('flight anchor rows', () => {
  const anchor: FlightAnchor = {
    id: 'anchor-out',
    direction: 'OUTBOUND',
    departureDate: '2026-10-02',
    departureTime: '09:30',
    departureAirport: '桃園國際機場',
    departureAirportIata: 'TPE',
    arrivalAirport: '金海國際機場',
    arrivalAirportIata: 'PUS',
    arrivalDate: '2026-10-02',
    arrivalTime: '13:05',
    airportArrivalBufferMinutes: 120,
    source: 'MANUAL',
  };

  it('survives the round trip unchanged', () => {
    expect(fromFlightAnchorRow(toFlightAnchorRow(anchor, 'trip-1'))).toEqual(anchor);
  });

  it('keeps a zero airport buffer, which is a real answer', () => {
    // "I am already at the airport." A falsy check would turn it into 120 and
    // put the arrival item two hours before a flight already being boarded.
    const row = toFlightAnchorRow({ ...anchor, airportArrivalBufferMinutes: 0 }, 'trip-1');
    expect(row.airport_arrival_buffer_minutes).toBe(0);
    expect(fromFlightAnchorRow(row).airportArrivalBufferMinutes).toBe(0);
  });

  it('stores absent optional airports as null, not empty string', () => {
    const row = toFlightAnchorRow(
      { id: 'a', direction: 'RETURN', departureDate: '', departureTime: '', departureAirport: '', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
      'trip-1',
    );
    expect(row.arrival_airport).toBeNull();
    expect(row.arrival_date).toBeNull();
    expect(row.departure_airport).toBe('');
  });

  it('falls back to outbound rather than dropping an unreadable direction', () => {
    const row = { ...toFlightAnchorRow(anchor, 'trip-1'), direction: 'SIDEWAYS' };
    expect(fromFlightAnchorRow(row).direction).toBe('OUTBOUND');
  });
});

describe('flightModeFromAnchors', () => {
  const leg = (direction: FlightAnchor['direction']): FlightAnchor => ({
    id: direction, direction, departureDate: '2026-10-02', departureTime: '09:30',
    departureAirport: 'TPE', airportArrivalBufferMinutes: 120, source: 'MANUAL',
  });

  it('is a round trip exactly when a return flight exists', () => {
    expect(flightModeFromAnchors([leg('OUTBOUND'), leg('RETURN')])).toBe('ROUND_TRIP');
    expect(flightModeFromAnchors([leg('OUTBOUND')])).toBe('ONE_WAY');
    expect(flightModeFromAnchors([])).toBe('ONE_WAY');
  });
});

/**
 * 「這每次都跳出詢問 我已經回答過了」, and 「並且像代辦清單 要可以打勾的」.
 *
 * Both answers used to live on the device, because the cloud had nowhere to
 * put them — and a shared trip hydrates from these rows on every open, so
 * anything this mapping could not carry was wiped by the next snapshot.
 * Columns 0022 and 0029, run 2026-10-18.
 */
describe('the two answers that used to live on one phone', () => {
  it('carries 「these two are not the same purchase」 both ways', () => {
    const settled = { ...expense, notDuplicateOf: ['expense-2', 'expense-3'] };

    expect(fromExpenseRow(toExpenseRow(settled, TRIP)).notDuplicateOf)
      .toEqual(['expense-2', 'expense-3']);
  });

  /*
    Absent rather than empty. The fingerprint is the row as text, so an empty
    array on every expense would republish a ledger nobody edited.
  */
  it('leaves an expense nobody answered about alone', () => {
    expect(fromExpenseRow(toExpenseRow(expense, TRIP)).notDuplicateOf).toBeUndefined();
  });

  it('ignores anything in that column that is not an id', () => {
    const row = { ...toExpenseRow(expense, TRIP), not_duplicate_of: ['expense-2', 7, null, ''] };

    expect(fromExpenseRow(row).notDuplicateOf).toEqual(['expense-2']);
  });

  it('carries 「I already bought this ticket」', () => {
    const ticked = {
      id: 'it-2', time: '10:00', title: 'teamLab', location: 'teamLab', notes: '',
      type: 'ACTIVITY' as const, date: '2026-10-23', ticketBought: true,
    };

    expect(fromItineraryRow(toItineraryRow(ticked, 'trip-1')).ticketBought).toBe(true);
  });

  it('leaves a stop nobody ticked alone', () => {
    const plain = {
      id: 'it-3', time: '10:00', title: '淺草寺', location: '淺草寺', notes: '',
      type: 'ACTIVITY' as const, date: '2026-10-21',
    };

    expect(fromItineraryRow(toItineraryRow(plain, 'trip-1')).ticketBought).toBeUndefined();
  });
})

/**
 * 購物清單, shared with the trip since 0031.
 *
 * 「這照片好像不會存」 was a full device; underneath it, a list that had only
 * ever lived inside one phone's draft.
 */
describe('the shopping list', () => {
  const item: ShoppingItem = {
    id: 's1', name: 'SK-II 青春露', isPurchased: false, phase: 'during',
    description: 'SK-II · 230ml', shop: '松本清', category: '美妝保養',
    priority: 'must', quantity: 2, estimatedAmount: 4200, estimatedCurrency: 'NT$',
    photo: 'bottle', photoSource: 'https://example.com/p',
  };

  it('survives a round trip', () => {
    expect(fromShoppingRow(toShoppingRow(item, 'trip-1'))).toEqual(item);
  });

  it('carries the trip it belongs to', () => {
    expect(toShoppingRow(item, 'trip-1').trip_id).toBe('trip-1');
  });

  /*
    Absent rather than null on the way back: the client's shape says 「nobody
    said」 with a missing field, and a null would read as an answer.
  */
  it('leaves what nobody filled in absent', () => {
    const bare = fromShoppingRow(toShoppingRow(
      { id: 's2', name: '轉接頭', isPurchased: false, phase: 'pre' },
      'trip-1',
    ));

    expect(bare).toEqual({ id: 's2', name: '轉接頭', isPurchased: false, phase: 'pre' });
  });

  /* 已買 is a fact two people share; it must survive the trip to the server. */
  it('carries 已買 both ways', () => {
    const bought = toShoppingRow({ ...item, isPurchased: true }, 'trip-1');

    expect(bought.is_purchased).toBe(true);
    expect(fromShoppingRow(bought).isPurchased).toBe(true);
  });
});

/**
 * 「這兩個我隨便搜都知道價格」 — the product page a traveller names when the
 * search cannot find it. It lived in the local draft only until migration
 * 0032 ran, so a cloud reload dropped it.
 */
describe('a product page the traveller named', () => {
  const item = (patch: Partial<ShoppingItem> = {}): ShoppingItem => ({
    id: 's1', name: 'Chanel 唇霜', isPurchased: false, phase: 'during', ...patch,
  });

  it('carries it out and back', () => {
    const row = toShoppingRow(item({ priceUrls: { JP: 'https://shop.example.jp/1' } }), 't1');

    expect(row.price_urls).toEqual({ JP: 'https://shop.example.jp/1' });
    expect(fromShoppingRow(row).priceUrls).toEqual({ JP: 'https://shop.example.jp/1' });
  });

  /* Absent rather than empty: a row says 「nobody said」 by holding null. */
  it('says nothing when nobody named one', () => {
    expect(toShoppingRow(item(), 't1').price_urls).toBeNull();
    expect(toShoppingRow(item({ priceUrls: {} }), 't1').price_urls).toBeNull();
    expect(fromShoppingRow(toShoppingRow(item(), 't1'))).not.toHaveProperty('priceUrls');
  });

  it('survives a row written before the column existed', () => {
    const legacy = { ...toShoppingRow(item(), 't1'), price_urls: null };
    expect(fromShoppingRow(legacy)).not.toHaveProperty('priceUrls');
  });
});
