/**
 * The live ledger, row for row, as the database holds it.
 *
 * 「其他 888」 stayed in the owner's category list and inside his headline total
 * after a read timestamped later than the correction, on a build whose filter
 * was already proven against synthetic data. Synthetic data is what makes that
 * possible: it tests the rule, never the rows.
 *
 * So these are the rows — copied from `select ... from expenses where trip_id =
 * 'muo3ht39hl3hpfed'` — mapped through the same `fromExpenseRow` the app uses.
 * If this passes, the fault is upstream of the rule: in which identity the
 * device believes it holds, or in what reached it.
 */
import { describe, expect, it } from 'vitest';
import { fromExpenseRow } from './tripSyncMapping';
import { expenseConcernsMember, partitionByConcern } from './expenseConcernsMember';

const OWNER = 'muo3ht39hl3hpfed:owner';
const GINA = 'muoal9czpaxkzw1l';

const row = (over: Record<string, unknown>) => fromExpenseRow({
  id: 'x', trip_id: 'muo3ht39hl3hpfed', created_by_member_id: null,
  description: '', amount: 0, currency: 'TWD', exchange_rate: 1, handling_fee: 0,
  twd_amount: 0, category: '其他', payment_method: null, phase: 'pre', date: '2026-10-03',
  payer_id: null, payer_allocations: {}, beneficiaries: [], split_method: 'EQUAL',
  split_allocations: {}, disputes: [], needs_review: false, linked_shopping_item_id: null,
  ...over,
} as never);

/** Exactly what the server returns for this trip. */
const ledger = [
  row({ id: 'e-sim', description: 'Esim', amount: 500, category: 'SIM卡/網卡', payer_id: OWNER, beneficiaries: [OWNER], created_by_member_id: OWNER }),
  row({ id: 'e-air', description: '機票', amount: 12000, category: '機票', payer_id: OWNER, beneficiaries: [OWNER, GINA], created_by_member_id: OWNER }),
  row({ id: 'e-888', description: '哈哈❤️', amount: 888, category: '其他', payer_id: GINA, beneficiaries: [GINA], created_by_member_id: GINA }),
  row({ id: 'e-stay', description: '住宿', amount: 20000, category: '住宿', payer_id: OWNER, beneficiaries: [OWNER, GINA], created_by_member_id: OWNER }),
];

describe('the live Busan ledger, as the owner sees it', () => {
  it('leaves her 888 out of his, and keeps the other three in', () => {
    const { mine, others } = partitionByConcern(ledger, OWNER);

    expect(mine.map(expense => expense.id)).toEqual(['e-sim', 'e-air', 'e-stay']);
    expect(others.map(expense => expense.id)).toEqual(['e-888']);
  });

  it('sums his side to 32,500 rather than 33,388', () => {
    const mine = partitionByConcern(ledger, OWNER).mine;
    expect(mine.reduce((sum, expense) => sum + expense.amount, 0)).toBe(32500);
  });

  it('gives her the 888 and the two bills she is split into', () => {
    const { mine } = partitionByConcern(ledger, GINA);
    expect(mine.map(expense => expense.id)).toEqual(['e-air', 'e-888', 'e-stay']);
  });

  /**
   * 「誰新增那就是她新增的 要綁定用戶ID」.
   *
   * A bill you wrote stays yours to see even when you left yourself out of the
   * split — otherwise recording an expense makes it disappear from the screen
   * of the person who just recorded it.
   */
  it('keeps a bill with its author, even when the split names somebody else', () => {
    const wroteItForHer = row({
      id: 'e-gift', description: '幫她買的', amount: 300,
      payer_id: GINA, beneficiaries: [GINA], created_by_member_id: OWNER,
    });

    expect(expenseConcernsMember(wroteItForHer, OWNER)).toBe(true);
    expect(partitionByConcern([wroteItForHer], OWNER).others).toEqual([]);
  });

  /**
   * The row that produced 33,388, and the reason it took four rounds to see.
   *
   * Correcting the payer by hand moved `payer_id`, `beneficiaries` and
   * `created_by_member_id` to the second traveller and left `payer_allocations`
   * reading `{owner: 888}`. Every field anyone looked at named her; the one
   * nobody printed said he had put the money down, so the rule — correctly —
   * kept her 888 in his ledger.
   */
  it('reads a stale prepaid map back to the payer rather than the old one', () => {
    const corrected = row({
      id: 'e-888', description: '哈哈❤️', amount: 888,
      payer_id: GINA, beneficiaries: [GINA], created_by_member_id: GINA,
      payer_allocations: { [OWNER]: 888 },
    });

    expect(corrected.payerAllocations).toEqual({ [GINA]: 888 });
    expect(expenseConcernsMember(corrected, OWNER)).toBe(false);
  });

  it('ignores a lone prepaid entry that contradicts the payer', () => {
    // 「誰新增的、誰付款的、誰分擔」 is the whole model; a fourth input that only
    // restates the payer can do nothing but disagree with it one day.
    const stale = {
      ...row({ id: 'e-888', amount: 888, payer_id: GINA, beneficiaries: [GINA], created_by_member_id: GINA }),
      payerAllocations: { [OWNER]: 888 },
    };

    expect(expenseConcernsMember(stale, OWNER)).toBe(false);
  });

  it('still counts a real second payer who chipped in', () => {
    const bothPaid = row({
      id: 'e-both', amount: 1000, payer_id: GINA, beneficiaries: [GINA],
      payer_allocations: { [GINA]: 600, [OWNER]: 400 },
    });

    expect(expenseConcernsMember(bothPaid, OWNER)).toBe(true);
  });

  it('never rewrites a map with more than one payer in it', () => {
    const genuinelySplit = row({
      id: 'e-share', amount: 1000, payer_id: OWNER,
      payer_allocations: { [OWNER]: 600, [GINA]: 400 },
    });

    expect(genuinelySplit.payerAllocations).toEqual({ [OWNER]: 600, [GINA]: 400 });
    expect(expenseConcernsMember(genuinelySplit, GINA)).toBe(true);
  });

  /**
   * The failure mode that produced 33,388 on his screen: with no identity, the
   * rule deliberately shows everything rather than guess. Nothing downstream
   * can distinguish that from a filter that simply did not work.
   */
  it('shows the whole ledger when it does not know who is looking', () => {
    expect(partitionByConcern(ledger, undefined).others).toEqual([]);
    expect(partitionByConcern(ledger, '').others).toEqual([]);
    expect(expenseConcernsMember(ledger[2], '')).toBe(true);
  });
});
