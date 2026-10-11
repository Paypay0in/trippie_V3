import { describe, expect, it } from 'vitest';
import { SavedInspiration } from '../types';
import {
  countryLabel,
  groupSavedByPlace,
  groupSummary,
  initiallyOpen,
} from './savedGrouping';

/**
 * 「這個要以國家城市區分 不要全部攤開」.
 *
 * Most of these are about nothing falling out of the grouping. A saved place
 * that disappears because it had no country is worse than an ugly group: the
 * traveller saved it, and this list is the only record that they did.
 */

const place = (over: Partial<SavedInspiration> = {}): SavedInspiration => ({
  id: Math.random().toString(36).slice(2),
  title: '某個地方',
  country: '韓國',
  city: '釜山',
  ...over,
});

describe('grouping saved places', () => {
  it('puts one country in one group', () => {
    const groups = groupSavedByPlace([place(), place(), place()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].country).toBe('韓國');
    expect(groups[0].count).toBe(3);
  });

  it('separates cities inside a country', () => {
    const groups = groupSavedByPlace([
      place({ city: '釜山' }), place({ city: '首爾' }), place({ city: '釜山' }),
    ]);
    expect(groups[0].cities.map(city => city.city)).toEqual(['釜山', '首爾']);
    expect(groups[0].cities[0].items).toHaveLength(2);
  });

  it('keeps countries apart', () => {
    const groups = groupSavedByPlace([place(), place({ country: '日本', city: '東京' })]);
    expect(groups.map(group => group.country)).toEqual(['韓國', '日本']);
  });

  it('puts the country you saved most first', () => {
    const groups = groupSavedByPlace([
      place({ country: '日本', city: '東京' }),
      place(), place(), place(),
    ]);
    expect(groups[0].country).toBe('韓國');
  });

  /**
   * 韓國・韓國 is on the home screen today: a place that only knows its country
   * gets the country copied into the city, and the label prints it twice.
   */
  it('does not treat a country repeated as the city as a city', () => {
    const groups = groupSavedByPlace([place({ country: '韓國', city: '韓國' })]);
    expect(groups[0].cities[0].city).toBe('');
  });

  /** Saved, so it has to appear. It goes under 其他, never nowhere. */
  it('keeps a place that never said where it was', () => {
    const groups = groupSavedByPlace([place({ country: undefined, city: undefined })]);
    expect(groups).toHaveLength(1);
    expect(countryLabel(groups[0].country)).toBe('其他');
    expect(groups[0].count).toBe(1);
  });

  /** A loose end is not a destination; it must not be the first thing read. */
  it('sorts the unplaced last however many there are', () => {
    const groups = groupSavedByPlace([
      place({ country: undefined }), place({ country: undefined }),
      place({ country: undefined }), place({ country: '日本', city: '東京' }),
    ]);
    expect(groups[groups.length - 1].country).toBe('');
    expect(groups[0].country).toBe('日本');
  });

  it('keeps a country-only place inside its country, below the named cities', () => {
    const groups = groupSavedByPlace([
      place({ city: undefined }), place({ city: '釜山' }),
    ]);
    expect(groups[0].cities.map(city => city.city)).toEqual(['釜山', '']);
    expect(groups[0].count).toBe(2);
  });

  it('loses nothing at all', () => {
    const items = [
      place(), place({ city: '首爾' }), place({ country: '日本', city: '東京' }),
      place({ country: undefined, city: undefined }), place({ city: undefined }),
    ];
    const total = groupSavedByPlace(items).reduce((sum, group) => sum + group.count, 0);
    expect(total).toBe(items.length);
  });

  it('is empty for an empty list, rather than inventing 其他', () => {
    expect(groupSavedByPlace([])).toEqual([]);
  });
});

describe('what is open when you arrive', () => {
  /** 「不要全部攤開」. */
  it('opens nothing when there are several countries', () => {
    const groups = groupSavedByPlace([place(), place({ country: '日本', city: '東京' })]);
    expect(initiallyOpen(groups)).toEqual([]);
  });

  /**
   * One collapsed row and a question is not organised, it is hidden — and it
   * costs a tap to see what was already visible before this change.
   */
  it('opens the only country there is', () => {
    const groups = groupSavedByPlace([place(), place({ city: '首爾' })]);
    expect(initiallyOpen(groups)).toEqual(['韓國']);
  });

  it('opens nothing for an empty list', () => {
    expect(initiallyOpen([])).toEqual([]);
  });
});

describe('what a group says about itself', () => {
  it('counts cities and places', () => {
    const groups = groupSavedByPlace([
      place({ city: '釜山' }), place({ city: '首爾' }), place({ city: '首爾' }),
    ]);
    expect(groupSummary(groups[0])).toBe('2 個城市・3 個地點');
  });

  it('counts only places when no city is named', () => {
    const groups = groupSavedByPlace([place({ city: undefined }), place({ city: undefined })]);
    expect(groupSummary(groups[0])).toBe('2 個地點');
  });
});
