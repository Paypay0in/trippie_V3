import { describe, expect, it } from 'vitest';
import { Category, Expense, ItineraryItem, PaymentMethod, TripMember } from '../types';
import {
  ExpenseRow,
  fromExpenseRow,
  fromItineraryRow,
  fromMemberRow,
  toItineraryRow,
  toExpenseRow,
  toMemberRow,
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
    expect(restored).toEqual({ ...expense, linkedShoppingItemId: undefined });
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

    expect(fromMemberRow(toMemberRow(linked, TRIP))).toEqual(linked);
    expect(fromMemberRow(toMemberRow(guest, TRIP))).toEqual({
      ...guest,
      userId: undefined,
    });
  });

  it('stores a guest with a null user rather than a placeholder', () => {
    const row = toMemberRow({ id: 'member-bob', name: 'Bob', type: 'guest' }, TRIP);
    expect(row.user_id).toBeNull();
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
