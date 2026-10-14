/**
 * 「不要以區為單位，要是城市。日本。東京 這樣」 and 「語言一下 Japan 一下日本 這樣不 ok」.
 *
 * Asked in zh-TW, Google answers 「日本」 for the country and then 「Tokyo」,
 * 「Sapporo」, 「Taito City」 for everything inside it.
 */
import { describe, expect, it } from 'vitest';
import { cityDisplayName } from './cityNames';

describe('a city in the app s own language', () => {
  it('names the cities this app is used in', () => {
    expect(cityDisplayName('Tokyo')).toBe('東京');
    expect(cityDisplayName('Osaka')).toBe('大阪');
    expect(cityDisplayName('Busan')).toBe('釜山');
    expect(cityDisplayName('Seoul')).toBe('首爾');
  });

  /*
    「Osaka」 and 「Osaka City」 must not become two cities on the same screen,
    and a ward that slips through should still read as a place rather than as
    an administrative label.
  */
  it('drops Google s administrative suffixes', () => {
    expect(cityDisplayName('Osaka City')).toBe('大阪');
    expect(cityDisplayName('Taito City')).toBe('Taito');
    expect(cityDisplayName('Chuo Ward')).toBe('Chuo');
  });

  it('ignores case and surrounding space', () => {
    expect(cityDisplayName('  tokyo ')).toBe('東京');
  });

  /** Openly partial: a missing entry can only fail to translate. */
  it('leaves a city it does not know exactly as given', () => {
    expect(cityDisplayName('Matsumoto')).toBe('Matsumoto');
    expect(cityDisplayName('輪島')).toBe('輪島');
  });

  it('says nothing for nothing', () => {
    expect(cityDisplayName('')).toBe('');
    expect(cityDisplayName(undefined)).toBe('');
  });
});
