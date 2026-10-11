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
  /*
    「我希望這頁跳出來是卡片 不是滿版的一整頁」.

    The requirement did not change — everything down to Create Trip has to be
    reachable without scrolling — but what holds it did. A page that was one
    viewport tall became a card bounded by one, inset from all four edges, so
    the limit is now a maximum rather than a minimum.
  */
  it('卡片被視窗框住，而且是直欄排列', () => {
    expect(source).toContain('max-h-full');
    expect(source).toContain('flex-col');
    // Not a page any more: nothing here should be claiming the whole viewport.
    expect(source).not.toContain('min-h-[100dvh]');
  });

  it('是浮在 app 上的一張卡，不是取代 app 的一頁', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('rounded-sheet');
  });

  /*
    Everywhere else a tap outside closes a sheet, and everywhere else there is
    nothing to lose. Here there is a half-filled form.
  */
  it('點背景不會把填到一半的表單關掉', () => {
    expect(source).not.toMatch(/onClick=\{[^}]*onBack[^}]*\}\s*>\s*\{\/\*\s*One card/);
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

  /**
   * The inset survives the restyle, but it is no longer a number typed here.
   *
   * 「這個就太滿版 需要內縮」 was answered with 28px, chosen by eye because there
   * was no system to ask. The design brief that followed set the screen margin
   * at 20px for every screen and put the breathing room back a different way —
   * hairline borders and one scale instead of a wider gutter.
   *
   * Pinned as the token rather than the value, so the two cannot drift apart
   * again. If 20 still reads as too full on a real phone, the fix is one line
   * in index.css and every screen follows.
   */
  it('左右內縮來自共用的 token，不是這一頁自己填的數字', () => {
    expect(source).toContain('px-[var(--screen-pad)]');
    expect(readFileSync(resolve(process.cwd(), 'index.css'), 'utf8'))
      .toContain('--screen-pad');
  });
});
