import { describe, expect, it } from 'vitest';
import { getDestinationTips } from './destinationTips';

describe('destination tips', () => {
  it('gives Korea the map-app warning travellers actually need', () => {
    const tips = getDestinationTips('韓國');
    expect(tips.some(tip => tip.title.includes('Naver'))).toBe(true);
  });

  it('accepts the names people actually type for a country', () => {
    expect(getDestinationTips('南韓')).toEqual(getDestinationTips('韓國'));
    expect(getDestinationTips('  韓國  ')).toEqual(getDestinationTips('韓國'));
  });

  it('returns nothing rather than filler for a country with no entry', () => {
    // An empty section is honest; invented advice about a real place is not.
    expect(getDestinationTips('冰島')).toEqual([]);
    expect(getDestinationTips('')).toEqual([]);
    expect(getDestinationTips(undefined)).toEqual([]);
  });
});
