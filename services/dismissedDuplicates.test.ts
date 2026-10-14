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

/**
 * 「每次打開都一直問」.
 *
 * Twelve of fourteen pairs had gone quiet and two kept coming back. The answer
 * was filed under the two record ids, and an id is the one thing about a record
 * this app does not control: a shared trip is rebuilt from the cloud on every
 * open, so a row that returns as a new record returns with a new id.
 */
describe('當那兩筆的 id 在同步後換了', () => {
  const kept = bill('old-a', { description: '交通卡儲值', amount: 2000, date: '2026-10-05' });
  const other = bill('old-b', { description: '咖啡', amount: 2000, date: '2026-10-06' });
  /** The same two purchases, rebuilt from the cloud under new ids. */
  const keptAgain = { ...kept, id: 'new-a' };
  const otherAgain = { ...other, id: 'new-b' };

  it('答案還是算數', () => {
    const answered = rememberDismissed({}, 'busan', [pair(kept, other)]);

    expect(stillWorthAsking([pair(keptAgain, otherAgain)], answered, 'busan')).toHaveLength(0);
  });

  it('兩筆換邊也算數', () => {
    const answered = rememberDismissed({}, 'busan', [pair(kept, other)]);

    expect(stillWorthAsking([pair(otherAgain, keptAgain)], answered, 'busan')).toHaveLength(0);
  });

  /** A genuinely different purchase is still asked about. */
  it('真的是另一筆消費還是會問', () => {
    const answered = rememberDismissed({}, 'busan', [pair(kept, other)]);
    const beer = bill('new-c', { description: '啤酒', amount: 2000, date: '2026-10-06' });

    expect(stillWorthAsking([pair(keptAgain, beer)], answered, 'busan')).toHaveLength(1);
  });

  /** And the answer stays inside its own trip. */
  it('不會外溢到別的旅程', () => {
    const answered = rememberDismissed({}, 'busan', [pair(kept, other)]);

    expect(stillWorthAsking([pair(keptAgain, otherAgain)], answered, 'seoul')).toHaveLength(1);
  });
});
