import { describe, expect, it } from 'vitest';
import { splitSharedPrefix } from './sharedLabelPrefix';

describe('splitSharedPrefix', () => {
  it('lifts the shared name out of Japan\'s formalities', () => {
    const { shared, parts } = splitSharedPrefix([
      'Visit Japan Web 申報（入境審查）',
      'Visit Japan Web 申報（海關申報）',
      'Visit Japan Web 申報（檢疫）',
    ]);
    expect(shared).toBe('Visit Japan Web 申報');
    expect(parts).toEqual(['入境審查', '海關申報', '檢疫']);
  });

  it('leaves names alone when they share nothing', () => {
    const names = ['K-ETA (韓國電子旅行許可)', 'Q-Code 檢疫預檢系統', '海關申報'];
    expect(splitSharedPrefix(names)).toEqual({ shared: '', parts: names });
  });

  it('keeps full names when one of them is only the shared part', () => {
    // Stripping would leave that tile with no label at all.
    const names = ['Visit Japan Web', 'Visit Japan Web（海關申報）'];
    expect(splitSharedPrefix(names).shared).toBe('');
  });

  it('ignores a prefix too short to be worth lifting', () => {
    expect(splitSharedPrefix(['入境卡', '入境審查']).shared).toBe('');
  });

  it('handles a single name', () => {
    expect(splitSharedPrefix(['海關申報'])).toEqual({ shared: '', parts: ['海關申報'] });
  });
});
