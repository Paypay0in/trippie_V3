import { describe, expect, it } from 'vitest';
import { TripMember } from '../types';
import { settlementPillFor } from './splitSettlementPill';

/**
 * 「用這個新的UI 百分之百還原設計」 — the pill that ends a split row.
 *
 * It replaces 「分帳・你 $264」, which said what the bill cost the reader
 * without ever saying which way the money still has to move.
 */
const ME: TripMember = { id: 'me', name: '你', type: 'owner' };
const GINA: TripMember = { id: 'gina', name: 'Gina', type: 'member' };

const summary = (over: Partial<Parameters<typeof settlementPillFor>[0]['summary']> = {}) => ({
  payer: ME, involved: [ME, GINA], isPersonal: false, sharerCount: 2, viewerShare: 264, ...over,
});

describe('a bill the reader fronted', () => {
  it('says what the other traveller owes them', () => {
    const pill = settlementPillFor({ summary: summary(), netAmount: 528, viewerMemberId: 'me' });

    expect(pill?.direction).toBe('owed_to_viewer');
    expect(pill?.amount).toBe(264);
    expect(pill?.label).toBe('應付你 NT$ 264');
    expect(pill?.counterpart?.id).toBe('gina');
  });

  it('takes the bill minus their own share, so rounding cannot drift', () => {
    const pill = settlementPillFor({
      summary: summary({ viewerShare: 346 }), netAmount: 432, viewerMemberId: 'me',
    });

    expect(pill?.amount).toBe(86);
  });
});

describe('a bill somebody else fronted', () => {
  it('says what the reader owes, and to whom', () => {
    const pill = settlementPillFor({
      summary: summary({ payer: GINA, involved: [GINA, ME], viewerShare: 444 }),
      netAmount: 888,
      viewerMemberId: 'me',
    });

    expect(pill?.direction).toBe('viewer_owes');
    expect(pill?.label).toBe('需付給Gina NT$ 444');
    expect(pill?.counterpart?.id).toBe('gina');
  });

  it('falls back to 朋友 when the payer has no name here', () => {
    const pill = settlementPillFor({
      summary: summary({ payer: { id: 'b', name: '  ', type: 'guest' }, viewerShare: 948 }),
      netAmount: 948,
      viewerMemberId: 'me',
    });

    expect(pill?.label).toBe('需付給朋友 NT$ 948');
  });
});

describe('rows with no debt to describe', () => {
  it('says nothing on a bill nobody shares', () => {
    expect(settlementPillFor({
      summary: summary({ isPersonal: true, sharerCount: 1 }), netAmount: 624, viewerMemberId: 'me',
    })).toBeUndefined();
  });

  it('says nothing when the reader is unknown', () => {
    expect(settlementPillFor({ summary: summary(), netAmount: 528 })).toBeUndefined();
  });

  it('says nothing when the share rounds away to nothing', () => {
    // 「應付你 NT$ 0」 is furniture, and the design has no such state.
    expect(settlementPillFor({
      summary: summary({ viewerShare: 528 }), netAmount: 528, viewerMemberId: 'me',
    })).toBeUndefined();
  });
});
