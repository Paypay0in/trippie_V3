/**
 * The 入住／退房 prefix is recognised in one place, by both spellings.
 *
 * `services/stayItemTitles.ts` already says this in its own docstring — that
 * the prefix 「had four homes」 and that `App.tsx` 「matched a third by hand」.
 * The extraction happened; that caller did not get converted. So the comment
 * described a repo that did not exist, and the arrival repair went on asking
 * `title.startsWith('入住 ')` — a question an English itinerary answers no to.
 *
 * The failure is silent, which is what makes it worth a test rather than a
 * fix. A traveller reading the app in English books a hotel, the stay rows are
 * written in English, and the repair that pulls check-in down to after the
 * flight lands simply never fires. No error, no warning: just 「check-in
 * 15:00」 sitting above a flight that arrives at 21:55, which is the exact
 * wrong ordering 「先離開機場才會去旅館入住」 was raised about.
 *
 * Asserted across the source rather than at the one site, because the defect
 * is not that site — it is that a rule with more than one home eventually
 * disagrees with itself. A new caller that hand-rolls the prefix fails here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'ios', 'android', 'tests']);

/** The module that is allowed to know how the prefix is spelled. */
const HOME = 'services/stayItemTitles.ts';

const sources = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
};

/*
  A literal that matches the prefix at the start of a title — `startsWith`,
  `indexOf`, a slice, or an anchored regex. Prose about the prefix inside a
  comment is not a second implementation, so comment lines are skipped.
*/
const HAND_ROLLED = /(startsWith|indexOf|includes|replace|slice)\s*\(\s*['"`](入住|退房)|\/\^(入住|退房)/;

describe('the stay prefix', () => {
  it('is matched in exactly one module', () => {
    const offenders = sources(ROOT)
      .map(file => ({ file: relative(ROOT, file), text: readFileSync(file, 'utf8') }))
      .filter(({ file }) => file !== HOME)
      .flatMap(({ file, text }) =>
        text
          .split('\n')
          .map((line, index) => ({ line: line.trim(), number: index + 1 }))
          .filter(({ line }) => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
          .filter(({ line }) => HAND_ROLLED.test(line))
          .map(({ number }) => `${file}:${number}`),
      );

    expect(offenders).toEqual([]);
  });

  it('recognises an English check-in title, not only a Chinese one', async () => {
    const { isCheckInItem, isCheckOutItem } = await import('../services/stayItemTitles');

    // Both spellings, because an itinerary holds rows written before and after
    // the interface was translated.
    expect(isCheckInItem({ title: '入住 Lavender Hotel' })).toBe(true);
    expect(isCheckInItem({ title: 'Check-in Lavender Hotel' })).toBe(true);
    expect(isCheckOutItem({ title: '退房 Lavender Hotel' })).toBe(true);
    expect(isCheckOutItem({ title: 'Check-out Lavender Hotel' })).toBe(true);

    // A stop that merely names the hotel is not a check-in.
    expect(isCheckInItem({ title: '前往 Lavender Hotel' })).toBe(false);
    expect(isCheckInItem({ title: 'Dinner at Lavender Hotel' })).toBe(false);
  });
});
