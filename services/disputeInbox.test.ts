/**
 * @vitest-environment jsdom
 *
 * 「我提出疑問後，希望對方要收到疑問的通知📢」.
 *
 * A dispute was written onto the expense and then sat there, visible only as a
 * badge on one row of one list. The person being asked could go a whole trip
 * without seeing it.
 */
import { describe, expect, it } from 'vitest';
import { Expense, ExpenseDispute, TripMember } from '../types';
import {
  awaitingMyAnswer,
  describeNotice,
  disputeNoticesFor,
  loadSeenNotices,
  saveSeenNotices,
  unseenNotices,
} from './disputeInbox';

const MEMBERS: TripMember[] = [
  { id: 'me', name: 'North', type: 'owner' },
  { id: 'gina', name: 'Gina', type: 'member' },
];

const dispute = (over: Partial<ExpenseDispute> = {}): ExpenseDispute => ({
  id: 'd1', raisedByMemberId: 'gina', message: '這筆我沒有喝到',
  status: 'open', createdAt: '2026-10-03T10:00:00.000Z', ...over,
});

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-coffee', description: 'Strut coffee', amount: 950, currency: 'TWD', exchangeRate: 1,
  twdAmount: 950, category: '購物', paymentMethod: '信用卡', phase: 'during', date: '2026-10-03',
  createdByMemberId: 'me', payerId: 'gina', beneficiaries: ['me', 'gina'],
  splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

const notices = (expenses: Expense[], viewerMemberId: string) =>
  disputeNoticesFor({ expenses, viewerMemberId, tripOwnerMemberId: 'me', members: MEMBERS });

describe('being told a question was asked', () => {
  it('tells the person whose record it is', () => {
    const list = notices([expense({ disputes: [dispute()] })], 'me');

    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('awaiting_my_answer');
    expect(list[0].message).toBe('這筆我沒有喝到');
    expect(describeNotice(list[0])).toBe('Gina 對「Strut coffee」提出疑問');
  });

  it('does not tell somebody who cannot answer it', () => {
    // Three members hearing about a question only one of them can resolve is
    // noise addressed to the wrong people.
    expect(notices([expense({ disputes: [dispute()] })], 'gina')
      .filter(notice => notice.kind === 'awaiting_my_answer')).toEqual([]);
  });

  it('does not report my own question back to me', () => {
    const own = expense({ disputes: [dispute({ raisedByMemberId: 'me' })] });

    expect(notices([own], 'me')).toEqual([]);
  });

  it('stops once the question is answered', () => {
    const answered = expense({ disputes: [dispute({ status: 'resolved', response: '這杯是你的' })] });

    expect(awaitingMyAnswer(notices([answered], 'me'))).toEqual([]);
  });

  it('stops once the question is withdrawn', () => {
    const gone = expense({ disputes: [dispute({ status: 'withdrawn' })] });

    expect(notices([gone], 'me')).toEqual([]);
  });
});

describe('being told the answer', () => {
  it('tells whoever asked', () => {
    const answered = expense({
      disputes: [dispute({
        status: 'resolved', response: '這杯是你的', respondedByMemberId: 'me',
        resolvedAt: '2026-10-03T12:00:00.000Z',
      })],
    });

    const list = notices([answered], 'gina');

    expect(list[0].kind).toBe('my_question_answered');
    expect(describeNotice(list[0])).toBe('North 回覆了你對「Strut coffee」的疑問');
  });

  it('says so when the correction was applied without a sentence', () => {
    const applied = expense({
      disputes: [dispute({
        status: 'resolved', respondedByMemberId: 'me',
        resolvedAt: '2026-10-03T12:00:00.000Z', appliedAt: '2026-10-03T12:00:00.000Z',
      })],
    });

    expect(notices([applied], 'gina')[0].message).toBe('已照你的提議修正了');
  });
});

describe('the list itself', () => {
  it('puts the newest first', () => {
    const older = expense({ id: 'e1', disputes: [dispute({ id: 'd-old', createdAt: '2026-10-01T09:00:00.000Z' })] });
    const newer = expense({ id: 'e2', disputes: [dispute({ id: 'd-new', createdAt: '2026-10-04T09:00:00.000Z' })] });

    expect(notices([older, newer], 'me').map(notice => notice.disputeId)).toEqual(['d-new', 'd-old']);
  });

  it('drops what has already been dismissed, and keeps the rest', () => {
    const list = notices([expense({ disputes: [dispute()] })], 'me');

    expect(unseenNotices(list, [list[0].id])).toEqual([]);
    expect(unseenNotices(list, ['something else'])).toHaveLength(1);
  });

  it('remembers dismissals across a reload', () => {
    saveSeenNotices(['e-coffee:d1:awaiting_my_answer']);

    expect(loadSeenNotices()).toEqual(['e-coffee:d1:awaiting_my_answer']);
  });

  it('survives a corrupt store', () => {
    localStorage.setItem('trippie_dispute_notices_seen_v1', '{oops');

    expect(loadSeenNotices()).toEqual([]);
  });
});

/**
 * 「若有分帳指給我 要跳通知」.
 *
 * Until now the bell only carried questions about bills, never the bills
 * themselves — so a traveller learned what they owed by opening the ledger and
 * reading it, which is the thing a shared ledger exists to stop. The bell's own
 * hint already promised 「當有人新增支出…我們會立即通知你」.
 */
describe('a bill somebody else split to me', () => {
  const OWNER = 'seat-north';
  const GINA = 'seat-gina';

  const bill = (over: Record<string, unknown> = {}) => ({
    id: 'e-1',
    description: '燒肉',
    amount: 60000,
    currency: 'KRW',
    date: '2026-10-05',
    createdByMemberId: OWNER,
    payerId: OWNER,
    beneficiaries: [OWNER, GINA],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as never;

  const noticesFor = (viewer: string, expenses: unknown[]) => disputeNoticesFor({
    expenses: expenses as never,
    viewerMemberId: viewer,
    tripOwnerMemberId: OWNER,
    members: [
      { id: OWNER, name: 'North', type: 'owner' },
      { id: GINA, name: 'Gina', type: 'companion' },
    ] as never,
  });

  it('tells the person who was split in', () => {
    const [notice] = noticesFor(GINA, [bill()]);

    expect(notice?.kind).toBe('split_to_me');
    expect(describeNotice(notice)).toContain('North');
    expect(describeNotice(notice)).toContain('燒肉');
    // The share, not only that there is one — the number is the whole point.
    expect(notice?.message).toContain('2');
  });

  /**
   * Never for a bill I recorded, even though I am in its split: I put myself
   * there, and reporting it back is the app repeating what I just typed.
   */
  it('says nothing to the person who recorded it', () => {
    expect(noticesFor(OWNER, [bill()])).toEqual([]);
  });

  it('says nothing about a bill that leaves me out', () => {
    expect(noticesFor(GINA, [bill({ beneficiaries: [OWNER] })])).toEqual([]);
  });

  /** An exact split counts as much as a named beneficiary. */
  it('reads an exact allocation too', () => {
    const [notice] = noticesFor(GINA, [bill({
      beneficiaries: [OWNER],
      splitMethod: 'EXACT',
      splitAllocations: { [GINA]: 20000 },
    })]);

    expect(notice?.kind).toBe('split_to_me');
    expect(notice?.message).toContain('20,000');
  });

  /**
   * Keyed on the expense, so editing the split later does not produce a second
   * notice for the same bill — and so dismissing it stays dismissed.
   */
  it('is one notice per bill, however the split is edited', () => {
    const first = noticesFor(GINA, [bill()])[0];
    const second = noticesFor(GINA, [bill({ splitAllocations: { [GINA]: 30000 } })])[0];

    expect(first?.id).toBe(second?.id);
    expect(unseenNotices([second], [first.id])).toEqual([]);
  });
});
