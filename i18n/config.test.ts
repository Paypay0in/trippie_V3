import { describe, expect, it } from 'vitest';
import { FALLBACK_LANGUAGE, languageFromUrl, resolveLanguage } from './config';

describe('resolveLanguage', () => {
  it('reads every shape a browser reports Traditional Chinese in', () => {
    // A reader of Traditional Chinese must not land in English because their
    // browser spelled the tag differently from the one we thought of.
    for (const tag of ['zh', 'zh-TW', 'zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO']) {
      expect(resolveLanguage(tag)).toBe('zh-Hant');
    }
  });

  it('is not confused by case or surrounding whitespace', () => {
    expect(resolveLanguage('ZH-tw')).toBe('zh-Hant');
    expect(resolveLanguage('  en-GB  ')).toBe('en');
  });

  it('reads the English variants', () => {
    for (const tag of ['en', 'en-US', 'en-GB', 'en-AU']) {
      expect(resolveLanguage(tag)).toBe('en');
    }
  });

  it('sends a language we do not ship to English rather than pretending', () => {
    // Simplified Chinese is the pointed case: serving Traditional Chinese to a
    // zh-CN reader and calling it their language is worse than English, which
    // at least does not misrepresent itself.
    for (const tag of ['zh-CN', 'zh-Hans', 'ja', 'ko-KR', 'fr']) {
      expect(resolveLanguage(tag)).toBe('en');
    }
  });

  it('falls back when the device says nothing at all', () => {
    expect(resolveLanguage(undefined)).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(null)).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage('')).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage('   ')).toBe(FALLBACK_LANGUAGE);
  });

  it('falls back to Traditional Chinese, the language the product was written in', () => {
    // Every untranslated string resolves through this, so it has to be the
    // language the source strings are already in.
    expect(FALLBACK_LANGUAGE).toBe('zh-Hant');
  });
});

describe('languageFromUrl', () => {
  it('reads a language out of the query string', () => {
    expect(languageFromUrl('?lang=en')).toBe('en');
    expect(languageFromUrl('?lang=zh-TW')).toBe('zh-Hant');
  });

  it('normalises whatever was typed, rather than trusting it', () => {
    // The value is a URL, so anyone can put anything in it.
    expect(languageFromUrl('?lang=EN-gb')).toBe('en');
    expect(languageFromUrl('?lang=klingon')).toBe('en');
  });

  it('stays out of the way when no language was asked for', () => {
    // Undefined, not the fallback: the caller must fall through to the device
    // rather than have the URL quietly pin everyone to one language.
    expect(languageFromUrl('')).toBeUndefined();
    expect(languageFromUrl('?other=1')).toBeUndefined();
  });
});
