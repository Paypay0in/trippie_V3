/**
 * @vitest-environment jsdom
 *
 * 「滿版不好點」 and 「這個介面也真的太滿版」.
 *
 * This screen set --safe-top-base to 0rem, opting itself out of the inset
 * every other screen takes, and then offset the back link by 24px of its own.
 * On a phone whose top 59pt belong to the clock and the Dynamic Island, that
 * put the only control on the screen inside the strip iOS takes the taps in —
 * the same fault the update banner had, in a different file.
 *
 * jsdom does no layout, so what is checked is where the decision is made: this
 * screen uses the shared inset and the shared page margin rather than numbers
 * of its own.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'components/CommunityPostDetail.tsx'),
  'utf8',
);

describe('貼文內頁', () => {
  it('不再把安全區歸零', () => {
    expect(source).not.toContain('"0rem"');
  });

  it('用跟其他頁一樣的上方留白', () => {
    expect(source).toContain('data-safe-top');
    expect(source).toContain('"var(--header-top)"');
  });

  it('左右用共用的頁面邊距，不是自己填的數字', () => {
    expect(source).toContain('px-[var(--screen-pad)]');
    expect(source).not.toMatch(/<article className="p-5"/);
  });

  it('返回是一個 44pt 的可點範圍，不是一行字', () => {
    expect(source).toMatch(/min-h-11[^>]*>← 返回社群/);
  });
});

/**
 * The same opt-out was on two screens; it was reported about one.
 *
 * A fault fixed only where it was photographed is a fault still in the
 * product, so this is checked across every screen rather than in the one file
 * that prompted it.
 */
describe('沒有任何一頁把安全區歸零', () => {
  const screens = [
    'components/CommunityPostDetail.tsx',
    'components/SavedTravelDestinationDetail.tsx',
  ];

  it('兩個會蓋到時鐘的畫面都修好了', () => {
    for (const file of screens) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('"0rem"');
      expect(text, file).toContain('"var(--header-top)"');
    }
  });
});
