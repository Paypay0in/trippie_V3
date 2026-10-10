/**
 * @vitest-environment jsdom
 *
 * 「這每次都跳出詢問 我已經回答過了」.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Expense } from '../types';
import { DuplicatePair } from './duplicateReceipts';
import {
  loadDismissedDuplicates,
  pairKey,
  rememberDismissed,
  stillWorthAsking,
} from './dismissedDuplicates';

const bill = (id: string, over: Partial<Expense> = {}): Expense =>
  ({ id, description: id, amount: 2000, currency: 'KRW', date: '2026-10-06', ...over }) as Expense;

const pair = (a: Expense, b: Expense): DuplicatePair =>
  ({ keep: a, drop: b, confidence: 'same_day', againstExisting: false });

beforeEach(() => localStorage.clear());

describe('記住「這兩筆不是同一筆」', () => {
  it('回答過的下次不再問', () => {
    const coffee = bill('coffee');
    const medicine = bill('medicine');
    const answered = rememberDismissed({}, 'busan', [pair(coffee, medicine)]);
    expect(stillWorthAsking([pair(coffee, medicine)], answered, 'busan')).toHaveLength(0);
  });

  it('配對順序反過來也算同一組', () => {
    const coffee = bill('coffee');
    const medicine = bill('medicine');
    const answered = rememberDismissed({}, 'busan', [pair(coffee, medicine)]);
    expect(stillWorthAsking([pair(medicine, coffee)], answered, 'busan')).toHaveLength(0);
  });

  it('沒回答過的還是會問', () => {
    const answered = rememberDismissed({}, 'busan', [pair(bill('a'), bill('b'))]);
    expect(stillWorthAsking([pair(bill('c'), bill('d'))], answered, 'busan')).toHaveLength(1);
  });

  it('別趟旅程的答案不會互相影響', () => {
    const answered = rememberDismissed({}, 'busan', [pair(bill('a'), bill('b'))]);
    expect(stillWorthAsking([pair(bill('a'), bill('b'))], answered, 'seoul')).toHaveLength(1);
  });

  it('存得住，重新載入還在 —— 這正是雲端做不到的', () => {
    rememberDismissed({}, 'busan', [pair(bill('a'), bill('b'))]);
    const reloaded = loadDismissedDuplicates();
    expect(reloaded.busan).toContain(pairKey('a', 'b'));
  });

  it('帳目上自己帶的記號也認', () => {
    const left = bill('a', { notDuplicateOf: ['b'] });
    expect(stillWorthAsking([pair(left, bill('b'))], {}, 'busan')).toHaveLength(0);
  });

  it('壞掉的儲存內容不會讓它爆炸', () => {
    localStorage.setItem('trippie_not_duplicates_v1', '{{{');
    expect(loadDismissedDuplicates()).toEqual({});
  });
});
