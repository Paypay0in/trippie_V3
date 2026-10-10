/**
 * @vitest-environment jsdom
 *
 * What a stored bill's stage becomes when the trip is read back.
 *
 * 「這些歸帳」「要按照日期」. The date rule itself was already covered, and the
 * screen still showed 10/03 under 回國機場消費 — because a pure function nobody
 * calls on the stored record changes nothing. This is the gap: the load path,
 * from localStorage through to the expenses the recap renders.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Category, Expense } from '../types';
import { DRAFTS_STORAGE_KEY, readDraftStore, TripDraft } from './tripPersistence';

const busanBill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'olive-young',
    description: 'OLIVE YOUNG 美妝保養品',
    amount: 408,
    currency: 'TWD',
    exchangeRate: 1,
    twdAmount: 408,
    category: Category.COSMETICS,
    paymentMethod: 'CASH_TWD',
    // Filed by category at import, which is how an airport stage was guessed.
    phase: 'post',
    date: '2026-10-03',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

const storeTrip = (over: Partial<TripDraft>) => {
  const draft = {
    id: 'busan',
    name: '釜山',
    startDate: '2026-10-02',
    endDate: '2026-10-07',
    expenses: [busanBill()],
    companions: [],
    shoppingList: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as unknown as TripDraft;
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([draft]));
};

const readBills = () => readDraftStore().drafts[0].expenses;

beforeEach(() => localStorage.clear());

describe('讀回來的時候就按日期歸好', () => {
  it('10/03 的 OLIVE YOUNG 不再掛在回國機場消費', () => {
    storeTrip({});
    expect(readBills()[0].phase).toBe('during');
  });

  /*
    A version stamp used to guard this, so it ran once per trip. It recorded
    「done」 for a re-file the cloud copy undid a moment later, and then blocked
    the repair for good — 「我怎麼點還是看 他一直在回國」. Every read now files by
    date, so a stage cannot stay wrong just because a previous attempt was
    recorded as having happened.
  */
  it('每次讀都重算，不會因為「處理過了」就卡在錯的狀態', () => {
    storeTrip({});
    expect(readBills()[0].phase).toBe('during');
    expect(readBills()[0].phase).toBe('during');
  });

  it('真的在回國後買的，重算幾次都還是回國機場消費', () => {
    storeTrip({ expenses: [busanBill({ date: '2026-10-09' })] });
    expect(readBills()[0].phase).toBe('post');
  });
});

describe('行程沒有設日期的時候', () => {
  /*
    The header shows a range even then — App.tsx derives one from the bills
    themselves when the trip has none. So a trip can look dated on screen and
    carry no window at all, and this is the case where nothing moves.
  */
  it('整批維持原狀，畫面看起來就是沒變', () => {
    storeTrip({ startDate: '', endDate: '' });
    expect(readBills()[0].phase).toBe('post');
  });
});
