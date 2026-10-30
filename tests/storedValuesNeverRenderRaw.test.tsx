/**
 * A stored category or payment method is never printed straight onto a screen.
 *
 * 「這個變成用英文」 — the Founder switched the live app to English and the
 * ledger still read 機票 and 住宿. Every label around them had been translated,
 * because those come from the locale bundles; a category does not. The Chinese
 * IS the stored value (`Category.FLIGHT = '機票'`, written to localStorage and
 * Supabase on every expense anybody has recorded), so it can never be
 * translated at rest — only looked up at the moment it is shown.
 *
 * `services/categoryDisplay` is that lookup, and it existed already. The defect
 * was that six screens did not use it: the ledger list, the dashboard's two
 * recent-expense rows, the summary's category breakdown and its exported PDF,
 * the member settlement detail, and the shopping screenshot review. One rule,
 * seven homes, six of which did less — the shape this repo keeps producing.
 *
 * So this test does not check a label. It checks that no component interpolates
 * a stored value into JSX or into exported HTML without passing it through the
 * one module that knows how to name it. A seventh home fails here rather than
 * in somebody's ledger.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { categoryLabel, displayLocaleFrom, paymentMethodLabel } from '../services/categoryDisplay';
import { Category, PaymentMethod } from '../types';

const COMPONENTS = join(__dirname, '..', 'components');

/*
  `{expense.category}` and `${s.category}` — a stored value going straight into
  rendered output. Deliberately narrow: `data-testid={...category}` and
  `openCategory === stat.category` are comparisons and identifiers, which must
  keep using the stored value and must NOT be translated.
*/
const RAW_RENDER = /\{\s*(?:[A-Za-z_$][\w$]*)\.(?:category|cat|paymentMethod)\s*\}/;

/*
  A stored value used as an identity rather than as words. `key=` and
  `data-testid=` must keep the stored value: a React key that changed with the
  interface language would remount every row on a language switch, and a test
  id written in English would stop matching the moment somebody reads the app
  in Chinese. Excluded by what the line does, not by file.
*/
const IDENTITY_USE = /(?:\bkey=|data-testid=|aria-|===|!==)/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });

describe('stored values never render raw', () => {
  it('no component prints a stored category or payment method without the display lookup', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(COMPONENTS)) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, index) => {
        if (RAW_RENDER.test(line) && !IDENTITY_USE.test(line)) offenders.push(`${file.replace(COMPONENTS, 'components')}:${index + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    expect(offenders, `these print a stored value instead of calling categoryLabel/paymentMethodLabel:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('shows the stored Chinese in Chinese and the English label in English', () => {
    expect(categoryLabel(Category.FLIGHT, 'zh-Hant')).toBe('機票');
    expect(categoryLabel(Category.FLIGHT, 'en')).toBe('Flights');
    expect(categoryLabel(Category.ACCOMMODATION, 'en')).toBe('Accommodation');
    expect(paymentMethodLabel(PaymentMethod.CREDIT_CARD, 'en')).toBe('Credit card');
  });

  it('never rewrites the stored value itself', () => {
    // The guarantee the whole design rests on: display changes, data does not.
    expect(String(Category.FLIGHT)).toBe('機票');
    expect(String(PaymentMethod.CREDIT_CARD)).toBe('信用卡');
  });

  /*
    The locale decision had been copied inline into each screen as
    `i18n.language?.startsWith('en') ? 'en' : 'zh-Hant'`. One home now, because
    the day one copy is written differently is the day two screens disagree
    about what language they are in.
  */
  it('resolves the display locale from the interface language in one place', () => {
    expect(displayLocaleFrom('en')).toBe('en');
    expect(displayLocaleFrom('en-GB')).toBe('en');
    expect(displayLocaleFrom('zh-Hant')).toBe('zh-Hant');
    expect(displayLocaleFrom(undefined)).toBe('zh-Hant');
  });

  it('shows an unknown stored value as itself rather than blanking it', () => {
    // A row written by a newer build still reads as something.
    expect(categoryLabel('未來的分類', 'en')).toBe('未來的分類');
  });
});
