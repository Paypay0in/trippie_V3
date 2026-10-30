/**
 * @vitest-environment jsdom
 *
 * The settlement screen's two surfaces must be about the same bills, and money
 * belonging to nobody on the table must be reported rather than dropped.
 *
 * 「結算摘要顯示應付 NT$968，成員明細卻顯示 Ann 應付 NT$880、Sherry 應收
 * NT$904」, with the page also warning 「結算可能不準」. One screen, one trip,
 * three numbers.
 *
 * Two separate faults produced that, both reproduced here before being fixed.
 *
 * A — `SettlementFlow` was handed two lists and used a different one on each
 *     surface: the summary and the member rows read `outstandingExpenses`,
 *     which drops a bill once its non-owner participants are settled, while
 *     成員結算明細 read `expenses`, which does not. A settled bill was gone
 *     from one and still counted as debt in the other. Measured before the
 *     fix, that did not merely shift the figures — it reversed them: the
 *     summary said Sherry owed Ann 300 while the member table said Ann owed
 *     Sherry 580.
 *
 * B — `buildMemberPositions` keys everybody's net by member and then projects
 *     it onto `members`, so a participant the list does not hold has their
 *     share silently discarded. 「Everybody's net sums to zero」 — the one
 *     invariant the page rests on — then stops holding with nothing on screen
 *     to say why, and `settlementImbalances` cannot catch it because each
 *     bill's two sides add up exactly. The loss happens afterwards.
 *
 * Both are the shape this codebase keeps producing: one question with two
 * homes, and a failure made to render instead of reported.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import SettlementFlow from '../components/SettlementFlow';
import { filterOutstandingExpenses } from '../services/settlementConsumption';
import { settlementExpensesFor } from '../services/settlementScope';
import {
  buildMemberPositions,
  settlementImbalances,
  unknownParticipants,
} from '../services/memberSettlementDetail';
import { Category, Expense, SettlementBatch, TripMember } from '../types';

const ANN = 'trip:owner';
const SHERRY = 'seat-sherry';
/** A companion removed from the trip after the bill was recorded. */
const REMOVED = 'seat-removed';

const members: TripMember[] = [
  { id: ANN, name: 'Ann', type: 'owner' },
  { id: SHERRY, name: 'Sherry', type: 'guest' },
];

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, phase: 'during', date: '2026-10-01',
  payerId: ANN, beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/* Sherry fronted the hotel and has been settled for it; the dinner is open. */
const SETTLED = bill({
  id: 'e-hotel', description: 'Tokyo hotel', twdAmount: 1760, amount: 1760,
  payerId: SHERRY, beneficiaries: [ANN, SHERRY],
});
const OPEN = bill({
  id: 'e-dinner', description: 'Tokyo dinner', twdAmount: 600, amount: 600,
  payerId: ANN, beneficiaries: [ANN, SHERRY],
});

const batches: SettlementBatch[] = [
  {
    id: 'b-1',
    tripId: 't-tokyo',
    createdAt: '2026-10-05T00:00:00.000Z',
    status: 'settled',
    memberIdsKind: 'targets',
    expenseIds: [SETTLED.id],
    memberIds: [SHERRY],
  } as unknown as SettlementBatch,
];

/*
  Exactly what App.tsx computes and hands down, so the test exercises the real
  wiring: outstanding is derived FROM the visible set, not alongside it.
*/
const visible = settlementExpensesFor([SETTLED, OPEN], ANN);
const outstanding = filterOutstandingExpenses(visible, members, batches);

const open = () =>
  render(
    <SettlementFlow
      expenses={visible}
      outstandingExpenses={outstanding}
      members={members}
      batches={batches}
      tripId="t-tokyo"
      viewerMemberId={ANN}
      tripName="Tokyo"
      onSaveBatch={vi.fn()}
      onUpdateBatch={vi.fn()}
      onDeleteBatch={vi.fn()}
      onClose={vi.fn()}
    />,
  );

afterEach(cleanup);

describe('A: the two settlement surfaces', () => {
  it('disagree about which bills are still owed, which is the premise', () => {
    // Guards the fixture: if the settled bill ever stops leaving the
    // outstanding set, the assertions below would pass for the wrong reason.
    expect(visible.map(expense => expense.id)).toEqual(['e-hotel', 'e-dinner']);
    expect(outstanding.map(expense => expense.id)).toEqual(['e-dinner']);
  });

  it('gives 成員結算明細 the outstanding bills, not every visible one', async () => {
    open();
    await userEvent.click(screen.getByText('Sherry'));

    /*
      From the outstanding dinner alone Ann fronted 600 and owes 300 of it, so
      Sherry owes Ann 300 — the same direction the summary states. Read off the
      service the screen renders, so the comparison is with what it shows.

      Computed from `visible` instead, this was −580: Ann owing Sherry. The
      defect reversed the debt, it did not merely resize it.
    */
    const fromOutstanding = buildMemberPositions(outstanding, members, ANN);
    const sherryOutstanding = fromOutstanding.find(p => p.member.id === SHERRY);
    expect(sherryOutstanding?.net).toBeCloseTo(-300, 0);

    const fromVisible = buildMemberPositions(visible, members, ANN);
    const sherryVisible = fromVisible.find(p => p.member.id === SHERRY);
    expect(sherryVisible?.net).toBeCloseTo(580, 0);

    // The screen must be showing the first of those, so no 「可能不準」 notice
    // is raised about a bill that is simply closed.
    expect(screen.queryByTestId('settlement-imbalance')).toBeNull();
    expect(screen.getByTestId('member-' + SHERRY).textContent).toContain('300');
  });

  it('keeps every member net summing to zero on the outstanding set', () => {
    const total = buildMemberPositions(outstanding, members, ANN)
      .reduce((sum, position) => sum + position.net, 0);

    expect(total).toBeCloseTo(0, 2);
  });
});

describe('B: a participant with no row in the table', () => {
  const SHARED = bill({
    id: 'e-taxi', description: 'Tokyo taxi', twdAmount: 900, amount: 900,
    payerId: ANN, beneficiaries: [ANN, SHERRY, REMOVED],
  });

  it('is money the positions cannot place, so the nets do not sum to zero', () => {
    const total = buildMemberPositions([SHARED], members, ANN)
      .reduce((sum, position) => sum + position.net, 0);

    // 300 of the taxi belongs to somebody absent from `members`.
    expect(total).toBeCloseTo(300, 2);
  });

  it('is not something the per-bill imbalance check can see', () => {
    // Both sides of the taxi add up exactly; the money is lost afterwards,
    // when the totals are projected onto the members that remain.
    expect(settlementImbalances([SHARED], ANN)).toEqual([]);
  });

  it('is reported by name and amount instead of being discarded', () => {
    expect(unknownParticipants([SHARED], members, ANN)).toEqual([
      { memberId: REMOVED, net: -300 },
    ]);
  });

  it('says so on the screen rather than showing a silently short total', async () => {
    render(
      <SettlementFlow
        expenses={[SHARED]}
        outstandingExpenses={[SHARED]}
        members={members}
        batches={[]}
        tripId="t-tokyo"
        viewerMemberId={ANN}
        tripName="Tokyo"
        onSaveBatch={vi.fn()}
        onUpdateBatch={vi.fn()}
        onDeleteBatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Sherry'));

    expect(screen.getByTestId('settlement-orphaned-share')).toBeTruthy();
  });

  it('stays quiet when every participant has a row', () => {
    const clean = bill({
      id: 'e-ramen', twdAmount: 600, amount: 600,
      payerId: ANN, beneficiaries: [ANN, SHERRY],
    });

    expect(unknownParticipants([clean], members, ANN)).toEqual([]);
  });
});
