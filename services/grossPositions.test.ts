import { describe, expect, it } from 'vitest';
import { Category, Expense } from '../types';
import { grossPositionFor } from './grossPositions';

/**
 * 「還沒按下結算前應該我要有應付的金額」.
 *
 * The screen showed 應收 15,108 / 應付 0, which is true of the payment that
 * closes the trip and false about the trip: the reader had been fronted meals
 * all week, and that side was subtracted into nothing before it was ever shown.
 */

const ME = 'trip:owner';
const GINA = 'seat-gina';

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 1000, twdAmount: 1000, currency: 'TWD', exchangeRate: 1,
  category: Category.FOOD, phase: 'during', date: '2026-10-03',
  payerId: ME, beneficiaries: [ME, GINA], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

const positionOf = (expenses: Expense[]) =>
  grossPositionFor({ expenses, viewerMemberId: ME, ownerMemberId: ME });

describe('結算前的兩個方向', () => {
  it('我先付的帳，別人那一半是我的應收', () => {
    const { receivable, payable } = positionOf([bill({ twdAmount: 1000 })]);

    expect(Math.round(receivable)).toBe(500);
    expect(payable).toBe(0);
  });

  it('別人先付的帳，我那一半是我的應付——不會被應收抵銷掉', () => {
    const { receivable, payable } = positionOf([
      bill({ id: 'mine', twdAmount: 1000 }),
      bill({ id: 'hers', twdAmount: 600, payerId: GINA }),
    ]);

    expect(Math.round(receivable)).toBe(500);
    expect(Math.round(payable)).toBe(300);
  });

  it('自己付自己用的帳，兩邊都不算', () => {
    // 「我自己付・不分帳」 is spending, not a debt in either direction.
    const { receivable, payable } = positionOf([
      bill({ id: 'solo', twdAmount: 150, beneficiaries: [ME] }),
    ]);

    expect(receivable).toBe(0);
    expect(payable).toBe(0);
  });

  it('數得出來各有幾個人', () => {
    const { owingMemberCount, owedMemberCount } = positionOf([
      bill({ id: 'mine', twdAmount: 1000 }),
      bill({ id: 'hers', twdAmount: 600, payerId: GINA }),
    ]);

    expect(owingMemberCount).toBe(1);
    expect(owedMemberCount).toBe(1);
  });

  it('金額壞掉的帳不會污染總額', () => {
    const { receivable } = positionOf([
      bill({ id: 'broken', twdAmount: Number.NaN }),
      bill({ id: 'fine', twdAmount: 1000 }),
    ]);

    expect(Math.round(receivable)).toBe(500);
  });

  it('不知道讀的人是誰就什麼都不說', () => {
    const position = grossPositionFor({ expenses: [bill({})], ownerMemberId: ME });

    expect(position.receivable).toBe(0);
    expect(position.payable).toBe(0);
  });
});
