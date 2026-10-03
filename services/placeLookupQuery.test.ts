import { describe, expect, it } from 'vitest';
import { placeLookupQueries } from './placeLookupQuery';

/**
 * 「我還是希望要盡量找到資訊，你不能搜尋嗎？」.
 *
 * Two saved places sat on 「尚未取得地點座標」, and the reason was in the row
 * above them: the screenshot was saved with city 「韓國」 and country 「韓國」, so
 * the lookup went out as 「다곡소님 韓國 韓國」. That query cannot match anything.
 * The same name with 「부산」 finds candidates immediately.
 */

describe('placeLookupQueries', () => {
  it('does not put the country in twice', () => {
    expect(placeLookupQueries('다곡소님', { city: '韓國', country: '韓國' })).toEqual([
      '다곡소님 韓國',
      '다곡소님',
    ]);
  });

  it('leads with the city when the trip names one', () => {
    expect(placeLookupQueries('단골손님', { city: '釜山', country: '韓國' })[0]).toBe('단골손님 釜山');
  });

  it('does not put a landmark from the notes into the query', () => {
    // Tried against the real API: 「단골손님 BIFF廣場 釜山」 returns BIFF 廣場 itself,
    // because autocomplete matches the whole string. 「단골손님 釜山」 returns the
    // two actual restaurants.
    expect(placeLookupQueries('단골손님', {
      city: '釜山',
      country: '韓國',
      notes: ['韓式餐廳', '位於BIFF廣場附近', '主打生牛肉'],
    })).toEqual(['단골손님 釜山', '단골손님']);
  });

  it('falls back to the bare name last', () => {
    // Loosest match, so never while a narrower query is still available:
    // 「다곡소님」 alone returns a village in India.
    const queries = placeLookupQueries('단골손님', { city: '釜山', country: '韓國' });
    expect(queries[queries.length - 1]).toBe('단골손님');
  });

  it('never repeats a query', () => {
    const queries = placeLookupQueries('단골손님', {});
    expect(queries).toEqual(['단골손님']);
  });

  it('is empty without a name', () => {
    expect(placeLookupQueries('   ', { city: '釜山' })).toEqual([]);
  });
});
