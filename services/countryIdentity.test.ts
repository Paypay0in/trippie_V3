/**
 * 「那這個問題點也可以限制在用戶成立旅冊」.
 *
 * The backfill asked Google where each saved place was and wrote back what it
 * answered — 「Japan」 — beside records that had been saying 「日本」 all along.
 * The home screen then showed 「日本 5 則」 and 「Japan・Taito City 1 則」 as two
 * different places to have been.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { countryDisplayName, countryKey, preferredCountryName, sameCountry } from './countryIdentity';

describe('two spellings of one country', () => {
  it('knows 日本 and Japan are the same place', () => {
    expect(sameCountry('日本', 'Japan')).toBe(true);
    expect(countryKey('日本')).toBe(countryKey('JP'));
  });

  it('knows the Korean forms', () => {
    expect(sameCountry('韓國', 'South Korea')).toBe(true);
    expect(sameCountry('대한민국', '한국')).toBe(true);
    expect(sameCountry('韓国', 'KR')).toBe(true);
  });

  it('knows 台灣 and Taiwan', () => {
    expect(sameCountry('台灣', 'Taiwan')).toBe(true);
    expect(sameCountry('臺灣', 'TW')).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(sameCountry(' japan ', 'JAPAN')).toBe(true);
  });

  it('does not merge two different countries', () => {
    expect(sameCountry('日本', '韓國')).toBe(false);
    expect(sameCountry('Taiwan', 'Thailand')).toBe(false);
  });

  /*
    A country missing from the table compares by its own text, which is the
    behaviour before this existed — a gap can only fail to merge, never merge
    two countries wrongly.
  */
  it('falls back to the text for a country it does not know', () => {
    expect(sameCountry('摩納哥', '摩納哥')).toBe(true);
    expect(sameCountry('摩納哥', 'Monaco')).toBe(false);
  });

  it('treats nothing as nothing', () => {
    expect(sameCountry('', '')).toBe(false);
    expect(sameCountry(undefined, '日本')).toBe(false);
    expect(countryKey(undefined)).toBe('');
  });
});

describe('which spelling to keep', () => {
  /** What the rest of the traveller's trip is written in. */
  it('keeps the one already on the record', () => {
    expect(preferredCountryName('日本', 'Japan')).toBe('日本');
    expect(preferredCountryName('韓國', 'South Korea')).toBe('韓國');
  });

  it('takes the lookup when the record had none', () => {
    expect(preferredCountryName('', 'Japan')).toBe('Japan');
    expect(preferredCountryName(undefined, 'Japan')).toBe('Japan');
  });

  it('keeps the record when the lookup had none', () => {
    expect(preferredCountryName('日本', undefined)).toBe('日本');
  });

  /** A genuinely different country means the record was wrong. */
  it('corrects a record that names another country', () => {
    expect(preferredCountryName('韓國', 'Japan')).toBe('Japan');
  });
});

/**
 * The grouping key the home screen uses, asserted at the call site too — a
 * normaliser nothing calls is a normaliser that does not exist, and this
 * project has shipped one of those.
 */
describe('the home screen groups on it', () => {
  it('is wired into the saved-notes grouping', () => {
    const home = readFileSync(resolve(__dirname, '../components/TravelHome.tsx'), 'utf8');

    expect(home).toContain('countryKey(country)');
    // And not on the raw text, which is what split 日本 from Japan.
    expect(home).not.toContain('${country.toLocaleLowerCase()}::');
  });

  it('is wired into what a backfill writes back', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

    expect(app).toContain('preferredCountryName(inspiration.country, resolved.country)');
  });
});

/**
 * 「語言一下 Japan 一下日本 這樣不 ok」.
 *
 * Both were honestly produced: Google answers 日本 under zh-TW, and the
 * hand-written airport directory stores Japan because its airport names are
 * English. Two sources, two languages, one screen.
 */
describe('what the reader is shown', () => {
  it('says one language, whichever the record holds', () => {
    expect(countryDisplayName('Japan')).toBe('日本');
    expect(countryDisplayName('日本')).toBe('日本');
    expect(countryDisplayName('JP')).toBe('日本');
  });

  it('does the same for the other countries this app is used in', () => {
    expect(countryDisplayName('South Korea')).toBe('韓國');
    expect(countryDisplayName('대한민국')).toBe('韓國');
    expect(countryDisplayName('Taiwan')).toBe('台灣');
  });

  /** No better name than the one it was given. */
  it('shows an unknown country exactly as stored', () => {
    expect(countryDisplayName('摩納哥')).toBe('摩納哥');
    expect(countryDisplayName('Monaco')).toBe('Monaco');
  });

  it('shows nothing for nothing', () => {
    expect(countryDisplayName('')).toBe('');
    expect(countryDisplayName(undefined)).toBe('');
  });

  /*
    Display only. Normalising on the way in would mean rewriting records and
    picking a winner between two correct answers.
  */
  it('is used where the cards are drawn', () => {
    const home = readFileSync(resolve(__dirname, '../components/TravelHome.tsx'), 'utf8');
    const planner = readFileSync(resolve(__dirname, '../components/TripInspirationPlanner.tsx'), 'utf8');

    // The label, kept beside the raw value rather than replacing it — a card
    // reads 「釜山」 and navigates with 「Busan」. See the saved-note card tests.
    expect(home).toContain('countryLabel: countryDisplayName(country)');
    expect(planner).toContain('countryDisplayName(group.country)');
  });
});
