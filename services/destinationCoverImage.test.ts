/**
 * 「這圖都不對」 — a trip to Tokyo and a trip to Okinawa both wearing the same
 * photograph of Fushimi Inari, which is in Kyoto.
 */
import { describe, expect, it } from 'vitest';
import { coverImageQuery, fixtureImageFor, fixtureKeyFor } from './destinationCoverImage';

describe('which place the name actually says', () => {
  /*
    The fault that made both cards identical: the lookup took the first key
    contained in the name, in whatever order the object listed them. 「日本沖繩」
    contains 「日本」, and 日本 came first, so Okinawa could never be reached.
  */
  it('reads 日本沖繩 as Okinawa, not as Japan', () => {
    expect(fixtureKeyFor('日本沖繩')).toBe('沖繩');
  });

  it('still reads a trip that only names the country', () => {
    expect(fixtureKeyFor('日本')).toBe('日本');
  });

  it('reads an English trip name', () => {
    expect(fixtureKeyFor('Tokyo')).toBe('tokyo');
    expect(fixtureKeyFor('Okinawa 2026')).toBe('okinawa');
  });

  it('says nothing for a name that names nowhere', () => {
    expect(fixtureKeyFor('我的旅程')).toBeUndefined();
    expect(fixtureKeyFor('')).toBeUndefined();
  });
});

describe('the picture', () => {
  /** Tokyo and Okinawa were pointed at the same photo id. */
  it('gives Tokyo and Okinawa different photographs', () => {
    expect(fixtureImageFor('東京')).not.toBe(fixtureImageFor('沖繩'));
  });

  it('gives a city its own picture rather than its country s', () => {
    expect(fixtureImageFor('日本沖繩')).not.toBe(fixtureImageFor('日本'));
  });

  it('falls back to something for a place it does not know', () => {
    expect(fixtureImageFor('摩納哥')).toContain('images.unsplash.com');
  });
});

describe('what to ask the photo service for', () => {
  /*
    Destination detection writes the *country* into the destination field, so
    a trip named 日本沖繩 was asking for a photo of 日本 — which is how two
    different trips came to request the same photograph.
  */
  it('prefers the name when it names somewhere more specific', () => {
    expect(coverImageQuery('日本', '日本沖繩')).toBe('日本沖繩');
    expect(coverImageQuery('日本', 'Tokyo')).toBe('Tokyo');
  });

  it('keeps the destination when it is the specific one', () => {
    expect(coverImageQuery('沖繩', '我的旅程')).toBe('沖繩');
  });

  it('keeps the destination when neither names a known place', () => {
    expect(coverImageQuery('某個小鎮', '我的旅程')).toBe('某個小鎮');
  });

  it('uses whichever one exists', () => {
    expect(coverImageQuery('', 'Tokyo')).toBe('Tokyo');
    expect(coverImageQuery('沖繩', '')).toBe('沖繩');
  });
});

/**
 * The ordering is explicit, not incidental. Taking whichever key came first is
 * the fault this module exists to fix, and 日本 and 沖繩 are the same length —
 * so length alone would have left it to chance.
 */
describe('how two matching keys are ranked', () => {
  it('prefers the city over the country at equal length', () => {
    expect(fixtureKeyFor('日本沖繩')).toBe('沖繩');
    expect(fixtureKeyFor('沖繩日本')).toBe('沖繩');
  });

  it('prefers the longer city name', () => {
    expect(fixtureKeyFor('韓國濟州島')).toBe('濟州島');
  });

  it('takes the country when that is all there is', () => {
    expect(fixtureKeyFor('日本旅行')).toBe('日本');
  });
});
