/**
 * @vitest-environment jsdom
 *
 * 「1.這個諮 不是我的名字啊 我的用戶名是 Ann  2.這個總結算並不是他的總額啊」.
 *
 * Her settlement finally pointed the right way — 「應付給 諮 NT$ 16,000」 — and
 * named her own nickname as the person she owed, because the owner seat was
 * discarded when a snapshot was read and relabelled from whatever profile the
 * device happened to be signed in as.
 *
 * Underneath it, the report opened on 「旅程總支出成本 $33,388」 beneath the
 * heading 「您的旅費總分析」: the whole trip, offered as hers, on the screen of
 * someone responsible for 16,000 of it.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripSummaryModal from '../components/TripSummaryModal';
import { buildTripRoster } from '../services/tripRoster';
import { Category, Expense } from '../types';

const TRIP = 'muo3ht39hl3hpfed';
const OWNER_SEAT = `${TRIP}:owner`;
const HER_SEAT = 'muoal9czpaxkzw1l';
const HIS_ACCOUNT = '8b4c29bc-b53b-4b3f-89bb-d0efb0cc8871';

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, phase: 'pre', date: '2026-10-01',
  payerId: OWNER_SEAT, beneficiaries: [OWNER_SEAT], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/** The real pre-trip ledger: 33,388 across the trip, 16,000 of it hers. */
const ledger = [
  expense({ id: 'e-sim', description: 'Esim', amount: 500, twdAmount: 500, beneficiaries: [OWNER_SEAT] }),
  expense({ id: 'e-air', description: '機票', amount: 12000, twdAmount: 12000, beneficiaries: [OWNER_SEAT, HER_SEAT] }),
  expense({ id: 'e-888', description: '哈哈', amount: 888, twdAmount: 888, payerId: HER_SEAT, beneficiaries: [HER_SEAT] }),
  expense({ id: 'e-stay', description: '住宿', amount: 20000, twdAmount: 20000, beneficiaries: [OWNER_SEAT, HER_SEAT] }),
];

afterEach(cleanup);

describe('the settlement report', () => {
  it('leads with what the trip cost this reader, not what passed through them', () => {
    render(
      <TripSummaryModal
        expenses={ledger}
        onArchive={() => undefined}
        variant="embedded"
        viewerMemberId={HER_SEAT}
        ownerMemberId={OWNER_SEAT}
      />,
    );

    // She bears 6,000 + 10,000 + her own 888, out of 32,888 passing through her.
    expect(screen.getByText(/\$16,888/)).toBeTruthy();
    // And she fronted 888 of it, so she is owed nothing and owes the rest.
    expect(screen.getByTestId('viewer-share').textContent).toContain('32,888');
    // His Esim, which concerns nobody but him, is not in her report at all.
    expect(screen.queryByText('Esim')).toBeNull();
    expect(screen.queryAllByText(/33,388/)).toEqual([]);
  });

  /**
   * 「我的總結算又加到她的帳」. His 準備清單 listed 哈哈❤️ $888 — her own spending —
   * and subtotalled 33,388, because only the headline figure had learned to
   * ask who was reading. The lists, the chart and the per-phase subtotals had
   * not.
   */
  it('keeps the other traveller’s own spending out of the itemised list', () => {
    render(
      <TripSummaryModal
        expenses={ledger}
        onArchive={() => undefined}
        variant="embedded"
        viewerMemberId={OWNER_SEAT}
        ownerMemberId={OWNER_SEAT}
      />,
    );

    expect(screen.queryByText('哈哈')).toBeNull();
    expect(screen.getAllByText('機票').length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/33,388/)).toEqual([]);
  });

  /**
   * 「機票與住宿 我們是除二的話 雖然我付 12000 但我實際支出是 6000」.
   *
   * He fronted 32,500 and bears 16,500 of it: 500 of his own, half of 12,000,
   * half of 20,000. The 16,000 between those two figures is what the
   * settlement screen already told the other traveller she owes him, so the
   * two screens finally agree.
   */
  it('separates what he fronted from what it cost him', () => {
    render(
      <TripSummaryModal
        expenses={ledger}
        onArchive={() => undefined}
        variant="embedded"
        viewerMemberId={OWNER_SEAT}
        ownerMemberId={OWNER_SEAT}
      />,
    );

    expect(screen.getByText(/\$16,500/)).toBeTruthy();
    const split = screen.getByTestId('viewer-share');
    expect(split.textContent).toContain('32,500');
    expect(split.textContent).toContain('待收回');
    expect(split.textContent).toContain('16,000');
  });

  it('says nothing extra on the screen of someone who owes the lot', () => {
    const allHis = [expense({ id: 'solo', amount: 500, twdAmount: 500 })];

    render(
      <TripSummaryModal
        expenses={allHis}
        onArchive={() => undefined}
        variant="embedded"
        viewerMemberId={OWNER_SEAT}
        ownerMemberId={OWNER_SEAT}
      />,
    );

    expect(screen.queryByTestId('viewer-share')).toBeNull();
  });
});

describe('the owner’s name on somebody else’s device', () => {
  it('comes from the trip, never from the profile reading it', () => {
    // What a snapshot carries, and what the reader's own profile says.
    const roster = buildTripRoster({
      tripId: TRIP,
      ownerUserId: HIS_ACCOUNT,
      ownerName: 'Ann',
      companions: [{ id: HER_SEAT, name: 'Gina' }] as never,
      friends: [],
    });

    expect(roster.find(member => member.type === 'owner')?.name).toBe('Ann');
  });
});
