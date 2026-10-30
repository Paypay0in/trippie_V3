/**
 * An English interface must not print Chinese-formatted dates and money.
 *
 * Four screens called `Intl` and `toLocaleString` with `'zh-TW'` written in:
 * the itinerary price, the comment date, the trip-shelf date range and the
 * post date. Every word around them translated and the numbers did not, which
 * is the quietest kind of half-translation — nothing looks broken, it just
 * answers in the wrong language.
 *
 * `services/localeFormat.ts` is the one home now, and it reads the locale at
 * call time rather than capturing it at import, because somebody can change
 * language while the app is open.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import i18n from '../i18n/config';
import {
  formatLocaleCurrency,
  formatLocaleDate,
  formatLocaleNumber,
} from '../services/localeFormat';

const ROOT = process.cwd();
const original = i18n.language;

afterEach(async () => {
  await i18n.changeLanguage(original);
});

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
    }
  };
  ['components', 'services', 'hooks'].forEach(walk);
  return out;
};

describe('formatting follows the chosen language', () => {
  it('writes a date the English way under English', async () => {
    await i18n.changeLanguage('en');
    expect(formatLocaleDate('2026-10-02', { month: 'short', day: 'numeric' })).toBe('Oct 2');
  });

  it('writes the same date the Chinese way under zh-Hant', async () => {
    await i18n.changeLanguage('zh-Hant');
    expect(formatLocaleDate('2026-10-02', { month: 'short', day: 'numeric' })).toBe('10月2日');
  });

  it('reads the language at call time, not at import', async () => {
    await i18n.changeLanguage('en');
    const english = formatLocaleDate('2026-10-02', { month: 'short', day: 'numeric' });
    await i18n.changeLanguage('zh-Hant');
    const chinese = formatLocaleDate('2026-10-02', { month: 'short', day: 'numeric' });
    expect(english).not.toBe(chinese);
  });

  it('keeps a price in its own currency in both languages', async () => {
    await i18n.changeLanguage('en');
    expect(formatLocaleCurrency(1200, 'JPY')).toContain('1,200');
    await i18n.changeLanguage('zh-Hant');
    expect(formatLocaleCurrency(1200, 'JPY')).toContain('1,200');
  });

  it('still prints the number for a currency Intl does not know', () => {
    expect(formatLocaleCurrency(1200, 'NOTACURRENCY')).toBe('NOTACURRENCY 1,200');
  });

  it('returns nothing for a date it cannot read, rather than a wrong one', () => {
    expect(formatLocaleDate('not a date')).toBe('');
    expect(formatLocaleDate(undefined)).toBe('');
    expect(formatLocaleNumber(Number.NaN)).toBe('');
  });
});

describe('nobody pins a formatter to one language', () => {
  it('no screen hardcodes zh-TW in Intl or toLocaleString', () => {
    const guilty = sourceFiles().filter(file => {
      if (file.endsWith(join('services', 'localeFormat.ts'))) return false;
      // The sync diagnostics panel stamps a fixed clock on purpose; it is
      // instrumentation read off a screenshot, not something a traveller sees.
      if (file.endsWith(join('hooks', 'useTripSync.ts'))) return false;
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      return /(?:Intl\.(?:DateTimeFormat|NumberFormat)|toLocale(?:Date|Time)?String)\(\s*['"]zh/.test(text);
    });
    expect(guilty).toEqual([]);
  });
});
