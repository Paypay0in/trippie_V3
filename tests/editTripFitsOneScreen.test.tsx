/**
 * @vitest-environment jsdom
 *
 * 「這個卡片我希望用戶不用上下滑就能看完並儲存」.
 *
 * The form was a stack of fixed heights that happened to add up to more than a
 * phone: a 16:9 cover sized off the page width, 28px between every section, and
 * Save Changes at the end of it. Nothing was too big on its own, which is why
 * it kept adding up — a screen whose length is the sum of its parts has nobody
 * responsible for the total.
 *
 * jsdom cannot measure a layout, so what is pinned here is the decision that
 * makes the total possible: the page is one viewport tall, the cover gives way
 * rather than dictating, and the actions take the room left over instead of
 * adding to the pile.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'components/CreateEditTripScreen.tsx'),
  'utf8',
);

describe('編輯旅程要一頁看完', () => {
  it('整頁就是一個視窗高，而且是直欄排列', () => {
    expect(source).toContain('min-h-[100dvh]');
    expect(source).toContain('flex-col');
  });

  /**
   * 100vh on a phone browser is taller than what you can actually see, because
   * the URL bar sits inside it. dvh is the height that is really there.
   */
  it('用 dvh 而不是 vh —— 手機網址列佔掉的高度要算進去', () => {
    expect(source).not.toMatch(/min-h-\[100vh\]/);
  });

  it('封面會讓步，不是用頁寬鎖死比例', () => {
    expect(source).toContain('h-[clamp(');
    expect(source).not.toContain('aspect-[16/9]');
  });

  it('儲存按鈕吃掉剩下的空間，不是再往下疊一段', () => {
    expect(source).toContain('mt-auto');
  });

  it('底部留白跟著安全區走，按鈕不會貼在 home indicator 上', () => {
    expect(source).toContain('env(safe-area-inset-bottom)');
  });

  /** The inset he asked for earlier has to survive the re-layout. */
  it('左右內縮沒有被這次改版吃掉', () => {
    expect(source).toContain('px-7');
  });
});
