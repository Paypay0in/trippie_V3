/**
 * @vitest-environment jsdom
 *
 * 「目前app 在手機上使用的時候 邊界太高 根本點不到」.
 *
 * index.html asks for viewport-fit=cover and a translucent status bar, which
 * puts the page under the clock and the Dynamic Island deliberately — that is
 * what makes a full-bleed header possible. The bottom navigation pays the
 * matching cost with env(safe-area-inset-bottom); nothing paid it at the top,
 * so on a notched phone the header sat beneath the island with its buttons
 * physically unreachable.
 *
 * The inset itself cannot be measured in jsdom. What can be checked is that the
 * headers a traveller meets at the top of the screen are the ones marked to
 * receive it — and that the mark is not sprayed over every header in the app,
 * which would push a dozen layouts down on devices with no inset at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('螢幕頂端的安全區域', () => {
  it('樣式表只針對標記過的元素，不是所有 header', () => {
    const css = read('index.css');
    expect(css).toContain('[data-safe-top]');
    expect(css).toContain('env(safe-area-inset-top)');
    // A bare `header {` rule would pad every card and sheet header too.
    expect(/^header\s*[,{]/m.test(css)).toBe(false);
  });

  it('不會把安全區域算兩次', () => {
    /*
      「有太大的空白」. A sticky header offset by the inset *and* padded by it
      leaves a gap the height of two status bars. Padding alone is the answer:
      the header's background fills the strip behind the clock.
    */
    expect(read('index.css')).not.toContain('[data-safe-top].sticky');
  });

  it('使用者會碰到的頂端畫面都處理了頂端安全區', () => {
    /*
      Marked, or inset explicitly.

      「我希望這頁跳出來是卡片」 — the trip editor is presented over the app now,
      and a floating card insets itself on all four sides rather than padding
      its own top past the island. Both discharge the same obligation; what
      must never happen is a screen that does neither.
    */
    const marked = (path: string) => {
      const text = read(path);
      return text.includes('data-safe-top') || text.includes('env(safe-area-inset-top)');
    };
    /*
      Every screen that owns the top of the display. 「這頁則是沒有改到」 — the
      first pass marked the community header and missed the travel home, which
      is the one most people open first.
    */
    for (const screen of [
      'components/CommunityHome.tsx',
      'components/TravelHome.tsx',
      'components/TripWorkspaceShell.tsx',
      'components/TripSelectionScreen.tsx',
      'components/AccountScreen.tsx',
      'components/CreatorCenterScreen.tsx',
      'components/CreateCommunityPostScreen.tsx',
      'components/CommunityPostDetail.tsx',
      'components/SavedTravelDestinationDetail.tsx',
      'components/CreateEditTripScreen.tsx',
      'App.tsx',
    ]) {
      expect(marked(screen), screen).toBe(true);
    }
  });

  it('底部的安全區域沒有被動到', () => {
    expect(read('components/AppBottomNav.tsx')).toContain('env(safe-area-inset-bottom)');
    expect(read('components/TripWorkspaceShell.tsx')).toContain('env(safe-area-inset-bottom)');
  });
});

/**
 * 「這頁還沒改好」 — asked of a screen running yesterday's build.
 *
 * The banner that says so was mounted inside the trip workspace, so it was
 * missing from the home screen, which is exactly where somebody stands when
 * they wonder whether they are looking at the new version.
 */
describe('更新提示的位置', () => {
  it('掛在 App 旁邊，不是某一個畫面裡面', () => {
    const entry = read('index.tsx');
    expect(entry).toContain('<StaleBuildBanner />');
    // Inside App it would be missing from whichever branch is not rendering.
    expect(read('App.tsx')).not.toContain('<StaleBuildBanner />');
    expect(read('components/TripWorkspaceShell.tsx')).not.toContain('StaleBuildBanner');
  });
});
