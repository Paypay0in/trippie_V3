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

  it('shortens only the names that actually collide', () => {
    // Japan's real list: one unrelated formality plus two that read alike.
    const { parts } = splitSharedPrefix([
      '簽證豁免',
      'Visit Japan Web 申報（入境審查）',
      'Visit Japan Web 申報（海關申報）',
    ]);
    expect(parts).toEqual(['簽證豁免', '入境審查', '海關申報']);
  });

  it('keeps a name that is entirely the shared part', () => {
    // Stripping would leave that tile with no label at all.
    const { parts } = splitSharedPrefix(['Visit Japan Web', 'Visit Japan Web（海關申報）']);
    expect(parts[0]).toBe('Visit Japan Web');
    expect(parts[1]).toBe('海關申報');
  });

  it('ignores a prefix too short to be worth lifting', () => {
    expect(splitSharedPrefix(['入境卡', '入境審查']).shared).toBe('');
  });

  it('handles a single name', () => {
    expect(splitSharedPrefix(['海關申報'])).toEqual({ shared: '', parts: ['海關申報'] });
  });
});
