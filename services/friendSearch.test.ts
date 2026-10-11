import { describe, expect, it } from 'vitest';
import { isCompleteEmail, normalizeEmail, searchIntent } from './friendSearch';

/**
 * 「可以互相加好友」, answered with search by email.
 *
 * The privacy cost of that choice is bounded by one property: the lookup is
 * exact. A partial match turns a lookup into an enumeration tool — 「a@」 would
 * answer 「here is everyone whose address starts that way」. The database
 * function matches exactly; this is the half that refuses to ask until there
 * is something exact to ask about.
 */
describe('normalizeEmail', () => {
  it('比對前先去空白、轉小寫', () => {
    expect(normalizeEmail('  Ann@Example.COM ')).toBe('ann@example.com');
  });

  it('空字串不會變成 undefined', () => {
    expect(normalizeEmail('')).toBe('');
  });
});

describe('isCompleteEmail', () => {
  it('完整的位址可以送出', () => {
    expect(isCompleteEmail('ann@example.com')).toBe(true);
    expect(isCompleteEmail('a.b+tag@mail.co.uk')).toBe(true);
  });

  /** Each of these, if sent, would be a prefix search in disguise. */
  it('打到一半的不送 —— 那會變成「幫我列出開頭是這樣的人」', () => {
    expect(isCompleteEmail('a')).toBe(false);
    expect(isCompleteEmail('a@')).toBe(false);
    expect(isCompleteEmail('@example.com')).toBe(false);
    expect(isCompleteEmail('ann@example')).toBe(false);
    expect(isCompleteEmail('ann@example.')).toBe(false);
  });

  it('有空白的不是一個位址', () => {
    expect(isCompleteEmail('ann @example.com')).toBe(false);
  });

  it('兩個 @ 不是一個位址', () => {
    expect(isCompleteEmail('a@b@example.com')).toBe(false);
  });

  it('長到不可能的也擋掉', () => {
    expect(isCompleteEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('searchIntent', () => {
  it('還沒打字就什麼都不做', () => {
    expect(searchIntent('', 'me@example.com')).toBe('idle');
  });

  it('打到一半就等，不要去問', () => {
    expect(searchIntent('ann@', 'me@example.com')).toBe('incomplete');
  });

  /**
   * Telling somebody 「no such person」 about their own address is a small lie,
   * and it is the kind that makes people distrust the rest of the screen.
   */
  it('打自己的位址，就說那是你自己', () => {
    expect(searchIntent('Me@Example.com ', 'me@example.com')).toBe('self');
  });

  it('完整而且不是自己，才去問', () => {
    expect(searchIntent('ann@example.com', 'me@example.com')).toBe('search');
  });

  it('沒登入也不會把自己誤判成別人', () => {
    expect(searchIntent('ann@example.com', undefined)).toBe('search');
  });
});
