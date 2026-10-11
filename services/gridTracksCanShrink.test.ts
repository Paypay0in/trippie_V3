/**
 * 「這頁則是沒有滿版」.
 *
 * A page narrower than the phone, with its right edge cut off, looked like a
 * width being set somewhere. It was the opposite: something refusing to be
 * narrower.
 *
 * `1fr` is `minmax(auto, 1fr)`. The track will not shrink below its content's
 * min-content width, and a date or time input reports a whole date or clock as
 * its minimum. One such control in a `1fr` track makes the row, the card and
 * the page wider than the screen, and nothing in the markup looks too wide.
 *
 * Tailwind's own `grid-cols-N` already floors at 0. Only hand-written track
 * lists can carry this, so only those are checked.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('自訂的 grid 軌道都要能縮', () => {
  it('沒有任何一個元件用光禿的 1fr', () => {
    const dir = resolve(process.cwd(), 'components');
    const offenders: string[] = [];

    for (const name of readdirSync(dir).filter(file => file.endsWith('.tsx'))) {
      const source = readFileSync(resolve(dir, name), 'utf8');
      for (const track of source.match(/grid-cols-\[[^\]]+\]/g) || []) {
        // minmax(0,1fr) is the floored form and is what this rule asks for.
        if (/(^|[_[])1fr/.test(track)) offenders.push(`${name}: ${track}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
