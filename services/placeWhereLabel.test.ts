/**
 * 「這個我手動加入的景點」 — and it read 「日本・日本」.
 */
import { describe, expect, it } from 'vitest';
import { placeWhereLabel } from './placeWhereLabel';

describe('saying where something is', () => {
  it('says a place once', () => {
    expect(placeWhereLabel('日本', '日本')).toBe('日本');
  });

  it('keeps a real town and country', () => {
    expect(placeWhereLabel('東京', '日本')).toBe('東京・日本');
  });

  /** Screens differ on whether they read outward or inward. */
  it('keeps the order it was given', () => {
    expect(placeWhereLabel('日本', '東京')).toBe('日本・東京');
  });

  it('ignores case and spacing when deciding it is the same', () => {
    expect(placeWhereLabel(' Japan ', 'japan')).toBe('Japan');
  });

  /** A city that really is its country was always the wrong line too. */
  it('collapses a city state', () => {
    expect(placeWhereLabel('新加坡', '新加坡')).toBe('新加坡');
  });

  it('drops the missing half rather than leaving a dot', () => {
    expect(placeWhereLabel(undefined, '日本')).toBe('日本');
    expect(placeWhereLabel('東京', '')).toBe('東京');
    expect(placeWhereLabel('  ', undefined)).toBe('');
  });
});
