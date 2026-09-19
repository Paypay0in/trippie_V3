import { describe, expect, it } from 'vitest';
import { Expense } from '../types';
import { spendingProfile, spendingProfileBrief } from './spendingProfile';

const expense = (twdAmount: number): Expense =>
  ({ id: `e${twdAmount}${Math.random()}`, twdAmount } as Expense);

const many = (count: number, each: number) => Array.from({ length: count }, () => expense(each));

describe('spending profile', () => {
  it('averages what was actually recorded, per travel day', () => {
    const profile = spendingProfile([{ expenses: many(6, 3000), days: 6 }]);
    expect(profile?.dailyAverageTwd).toBe(3000);
  });

  it('spans several trips', () => {
    const profile = spendingProfile([
      { expenses: many(5, 1000), days: 5 },
      { expenses: many(5, 3000), days: 5 },
    ]);
    expect(profile?.tripCount).toBe(2);
    expect(profile?.dailyAverageTwd).toBe(2000);
  });

  it('says nothing on a thin sample', () => {
    // Four expenses is one dinner and a taxi; planning a week around that
    // average would be inventing a budget, not observing one.
    expect(spendingProfile([{ expenses: many(4, 3000), days: 5 }])).toBeNull();
    expect(spendingProfile([])).toBeNull();
  });

  it('ignores a trip with no days recorded', () => {
    expect(spendingProfile([{ expenses: many(6, 3000), days: 0 }])).toBeNull();
  });

  it('describes the spending, never the person', () => {
    // An earlier version handed the planner a band, and it wrote 「考量您過往
    // 非常精省的預算習慣」 back to the traveller — a label drawn from their own
    // receipts.
    const brief = spendingProfileBrief(spendingProfile([{ expenses: many(6, 500), days: 6 }]));
    expect(brief).not.toContain('精省');
    expect(brief).not.toContain('寬裕');
    expect(brief).toContain('不要用形容詞描述或評價他的消費習慣');
  });

  it('words the brief as an observation, not a stated budget', () => {
    const brief = spendingProfileBrief(spendingProfile([{ expenses: many(6, 3000), days: 6 }]));
    expect(brief).toContain('平均每天');
    expect(brief).toContain('不是他說出口的預算');
  });

  it('has no brief without a profile', () => {
    expect(spendingProfileBrief(null)).toBe('');
  });
});
