import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import zhHant from './locales/zh-Hant.json';

/**
 * Every string exists in both languages.
 *
 * 「今後新增或修改功能，也必須同步提供英文介面」 — a rule stated once in a chat is
 * a rule nobody will remember in three months. This is the same rule as a
 * failing test: a key added to one bundle and forgotten in the other fails
 * here, by name, before it can reach a traveller as a blank label or a raw
 * `account.bio` on somebody's screen.
 *
 * Plural forms are the one allowed asymmetry. English needs `_one`/`_other`
 * where Chinese has a single form, so a key suffixed for plurals counts as
 * present when its base key is.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const flatten = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
};

const baseKeys = (bundle: unknown) =>
  new Set(flatten(bundle).map(key => key.replace(PLURAL_SUFFIX, '')));

describe('locale bundles', () => {
  it('translates every English key into Traditional Chinese', () => {
    const missing = [...baseKeys(en)].filter(key => !baseKeys(zhHant).has(key));

    expect(missing).toEqual([]);
  });

  it('translates every Traditional Chinese key into English', () => {
    const missing = [...baseKeys(zhHant)].filter(key => !baseKeys(en).has(key));

    expect(missing).toEqual([]);
  });

  it('leaves no English value still written in Chinese', () => {
    // The failure this catches is a copy-paste during migration: the key moves
    // into both bundles and the English side keeps the Chinese it came from,
    // which reads as a finished translation and is not one.
    const han = /[㐀-䶿一-鿿]/;
    const untranslated = flatten(en).filter(key => {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
      return typeof value === 'string' && han.test(value);
    });

    expect(untranslated).toEqual([]);
  });

  it('has no empty string in either bundle', () => {
    const empties = [en, zhHant].flatMap((bundle, index) =>
      flatten(bundle)
        .filter(key => {
          const value = key
            .split('.')
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
          return value === '';
        })
        .map(key => `${index === 0 ? 'en' : 'zh-Hant'}:${key}`),
    );

    expect(empties).toEqual([]);
  });
});
