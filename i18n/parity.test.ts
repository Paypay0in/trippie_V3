import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import ja from './locales/ja.json';
import zhHant from './locales/zh-Hant.json';

/**
 * Every string exists in every language.
 *
 * 「今後新增或修改功能，也必須同步提供英文介面」 — a rule stated once in a chat is
 * a rule nobody will remember in three months. This is the same rule as a
 * failing test: a key added to one bundle and forgotten in another fails
 * here, by name, before it can reach a traveller as a blank label or a raw
 * `account.bio` on somebody's screen.
 *
 * Plural forms are the one allowed asymmetry. English needs `_one`/`_other`
 * where Chinese and Japanese have a single form, so a key suffixed for plurals
 * counts as present when its base key is.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const BUNDLES = { en, 'zh-Hant': zhHant, ja } as const;
type BundleName = keyof typeof BUNDLES;

const flatten = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
};

const baseKeys = (bundle: unknown) =>
  new Set(flatten(bundle).map(key => key.replace(PLURAL_SUFFIX, '')));

const valueAt = (bundle: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

const names = Object.keys(BUNDLES) as BundleName[];

describe('locale bundles', () => {
  /*
    Every ordered pair, not just en↔zh. Three bundles make three pairs, and
    checking only the pairs somebody remembered is how a key reaches exactly
    two of them and nobody notices.
  */
  for (const from of names) {
    for (const to of names) {
      if (from === to) continue;

      it(`translates every ${from} key into ${to}`, () => {
        const missing = [...baseKeys(BUNDLES[from])].filter(key => !baseKeys(BUNDLES[to]).has(key));

        expect(missing).toEqual([]);
      });
    }
  }

  it('leaves no English value still written in Chinese', () => {
    // The failure this catches is a copy-paste during migration: the key moves
    // into both bundles and the English side keeps the Chinese it came from,
    // which reads as a finished translation and is not one.
    //
    // Deliberately asked of English only. Japanese is written in kanji, which
    // shares this Unicode block with Chinese, so the same check against ja.json
    // would fail on 宿泊 and 航空券 — correct Japanese reported as untranslated.
    // A test that cannot tell a language from a script has to be pointed at the
    // one language where the script is itself the defect.
    const han = /[㐀-䶿一-鿿]/;
    const untranslated = flatten(en).filter(key => {
      const value = valueAt(en, key);
      return typeof value === 'string' && han.test(value);
    });

    expect(untranslated).toEqual([]);
  });

  /*
    What the Han check cannot do for Japanese, this does instead: a Japanese
    value copied from the Chinese bundle is caught by being identical to it.

    Measured on the words, not the string. 「{{count}} 分」 and 「{{currency}}
    {{amount}} 以下」 are identical in both languages and correct in both — the
    placeholders are most of the characters and the rest is a word the two
    languages genuinely share. Counting raw length called twenty-four of those
    a defect. Counting only the CJK left after the placeholders go lets short
    real agreement through while a copied sentence still fails, which is the
    only thing this check is for.
  */
  it('leaves no Japanese value copied verbatim from Chinese', () => {
    const SHARED_WORDS_ARE_PLAUSIBLE_UP_TO = 6;
    const cjkWeight = (value: string) =>
      (value.replace(/\{\{\w+\}\}/g, '').match(/[㐀-䶿一-鿿ぁ-ゟ゠-ヿ]/g) ?? []).length;

    const copied = [...baseKeys(ja)].filter(key => {
      const jaValue = valueAt(ja, key);
      const zhValue = valueAt(zhHant, key);
      if (typeof jaValue !== 'string' || typeof zhValue !== 'string') return false;
      if (jaValue !== zhValue) return false;
      return cjkWeight(jaValue) > SHARED_WORDS_ARE_PLAUSIBLE_UP_TO;
    });

    expect(copied).toEqual([]);
  });

  it('has no empty string in any bundle', () => {
    const empties = names.flatMap(name =>
      flatten(BUNDLES[name])
        .filter(key => valueAt(BUNDLES[name], key) === '')
        .map(key => `${name}:${key}`),
    );

    expect(empties).toEqual([]);
  });

  /*
    An interpolation that exists in one language and not another is a blank in
    somebody's sentence: 「{{count}} 件」 translated as 「数件」 loses the number
    the screen was built to show. Compared against English, which is complete.
  */
  it('keeps every interpolation placeholder in every language', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();

    const mismatched: string[] = [];
    for (const key of flatten(en)) {
      const enValue = valueAt(en, key);
      if (typeof enValue !== 'string') continue;
      const wanted = placeholders(enValue);
      if (!wanted.length) continue;

      for (const name of names) {
        if (name === 'en') continue;
        /*
          The exact key only, never the base key it folds onto. English's
          `_one` form drops {{count}} — "The AI planned 1 day" — while the
          single Chinese and Japanese form keeps it, so falling back compared
          a singular against a form that serves every count and reported two
          correct strings as broken.
        */
        const value = valueAt(BUNDLES[name], key);
        if (typeof value !== 'string') continue;
        const got = placeholders(value);
        if (got.join(',') !== wanted.join(',')) {
          mismatched.push(`${name}:${key} has [${got}] but en has [${wanted}]`);
        }
      }
    }

    expect(mismatched).toEqual([]);
  });
});
