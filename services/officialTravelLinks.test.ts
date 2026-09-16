import { describe, expect, it } from 'vitest';
import { findOfficialLink } from './officialTravelLinks';

describe('official travel links', () => {
  it('sends a K-ETA task to the government site, not a search page', () => {
    // Searching for these turns up paid intermediaries charging several times
    // the real fee, which is exactly what this table exists to prevent.
    expect(findOfficialLink('韓國', 'K-ETA (韓國電子旅行許可)')?.url).toBe(
      'https://www.k-eta.go.kr',
    );
  });

  it('matches the checklist wording the app actually produces', () => {
    expect(findOfficialLink('南韓', 'Q-Code 檢疫預檢系統')?.url).toBe(
      'https://cov19ent.kdca.go.kr',
    );
    expect(findOfficialLink('韓國', '海關申報')?.label).toBe('韓國關稅廳');
  });

  it('answers passport questions wherever the trip goes', () => {
    expect(findOfficialLink('韓國', '護照有效期限')?.url).toBe('https://www.boca.gov.tw');
    expect(findOfficialLink('泰國', '護照有效期限')?.url).toBe('https://www.boca.gov.tw');
  });

  it('sends the Korean arrival card to the electronic one', () => {
    // Korea does have an online arrival card; an earlier version of this table
    // claimed it did not and left the item with no link at all.
    expect(findOfficialLink('韓國', '入境登記卡 (Arrival Card)')?.url).toBe(
      'https://www.e-arrivalcard.go.kr',
    );
  });

  it('gives no link rather than a guessed one', () => {
    // The checklist lends a link authority, so a wrong one is worse than none.
    expect(findOfficialLink('冰島', '入境許可')).toBeNull();
    expect(findOfficialLink(undefined, '')).toBeNull();
  });

  it('keeps each country to its own formalities', () => {
    expect(findOfficialLink('日本', 'K-ETA')).toBeNull();
  });
});
