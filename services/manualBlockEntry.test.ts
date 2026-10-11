import { describe, expect, it } from 'vitest';
import { alreadyOnThisDay, cleanManualTitle, MAX_TITLE } from './manualBlockEntry';

/**
 * 「下拉式選單要讓用戶也可以手動新增」.
 */

describe('a name typed into a slot', () => {
  it('keeps what was typed', () => {
    expect(cleanManualTitle('Cafe Onion 성수')).toBe('Cafe Onion 성수');
  });

  it('trims the edges', () => {
    expect(cleanManualTitle('  廣安里海灘  ')).toBe('廣安里海灘');
  });

  it('collapses the spacing a phone keyboard leaves behind', () => {
    expect(cleanManualTitle('Cafe   Onion')).toBe('Cafe Onion');
  });

  /**
   * A slot the traveller opened and thought better of is not an entry called
   * 「 」. A blank item on the plan is worse than an empty slot, because the
   * empty slot says 無, which is an answer.
   */
  it('is nothing when nothing was typed', () => {
    expect(cleanManualTitle('')).toBeNull();
    expect(cleanManualTitle('   ')).toBeNull();
    expect(cleanManualTitle('\n\t ')).toBeNull();
  });

  it('cuts a title that would run off every screen it appears on', () => {
    expect(cleanManualTitle('가'.repeat(200))).toHaveLength(MAX_TITLE);
  });
});

describe('noticing a repeat', () => {
  it('matches the same shop typed differently', () => {
    expect(alreadyOnThisDay('Cafe Onion', ['cafe  onion'])).toBe(true);
    expect(alreadyOnThisDay('廣安里海灘', ['廣安里海灘'])).toBe(true);
  });

  it('does not match a different place', () => {
    expect(alreadyOnThisDay('Cafe Onion', ['Cafe Knotted'])).toBe(false);
  });

  it('copes with a day that has nothing on it', () => {
    expect(alreadyOnThisDay('Cafe Onion', [])).toBe(false);
  });
});
