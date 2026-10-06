import { describe, expect, it } from 'vitest';
import { remainderMemberFor } from './splitRemainderMember';

/**
 * 「我可能更清楚 Gina 的是多少錢 … 我希望是兩個都可以」.
 *
 * The remainder was the last beneficiary, always, which decided for the
 * traveller which half of the bill they were allowed to know.
 */
const TWO = ['me', 'gina'];

describe('who carries the remainder', () => {
  it('starts on the last member, as it always did', () => {
    expect(remainderMemberFor({ beneficiaries: TWO })).toBe('gina');
  });

  it('moves to the other one when the traveller types into it', () => {
    // 「她那件是 19,000」, read off the receipt: now Gina's box is the typed one
    // and mine is what is left.
    expect(remainderMemberFor({
      beneficiaries: TWO, currentRemainderId: 'gina', lastEditedId: 'gina',
    })).toBe('me');
  });

  it('stays put while the traveller types into the other box', () => {
    // Otherwise the 自動計算 label hops between rows mid-keystroke.
    expect(remainderMemberFor({
      beneficiaries: TWO, currentRemainderId: 'gina', lastEditedId: 'me',
    })).toBe('gina');
  });

  it('swaps back again', () => {
    const first = remainderMemberFor({ beneficiaries: TWO, currentRemainderId: 'gina', lastEditedId: 'gina' });
    const second = remainderMemberFor({ beneficiaries: TWO, currentRemainderId: first, lastEditedId: first });

    expect([first, second]).toEqual(['me', 'gina']);
  });
});

describe('more than two people', () => {
  const THREE = ['me', 'gina', 'ann'];

  it('hands the remainder to somebody else, not to the typist', () => {
    expect(remainderMemberFor({
      beneficiaries: THREE, currentRemainderId: 'ann', lastEditedId: 'ann',
    })).toBe('gina');
  });

  it('keeps it where it is while the others are filled in', () => {
    expect(remainderMemberFor({
      beneficiaries: THREE, currentRemainderId: 'ann', lastEditedId: 'me',
    })).toBe('ann');
  });
});

describe('when the roster changes under it', () => {
  it('re-picks when whoever held it is no longer sharing the bill', () => {
    expect(remainderMemberFor({ beneficiaries: TWO, currentRemainderId: 'ann' })).toBe('gina');
  });

  it('gives it to the only member of a one-person split', () => {
    // Nothing to split, nothing to type.
    expect(remainderMemberFor({ beneficiaries: ['me'], lastEditedId: 'me' })).toBe('me');
  });

  it('has nobody to give it to on an empty split', () => {
    expect(remainderMemberFor({ beneficiaries: [] })).toBeUndefined();
  });
});
