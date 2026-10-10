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

  it('sticky 的標題列也要從安全區域下面開始', () => {
    // Padding alone moves it once; the first scroll returns it under the island.
    expect(read('index.css')).toContain('[data-safe-top].sticky');
  });

  it('使用者會碰到的頂端畫面都標記了', () => {
    const marked = (path: string) => read(path).includes('data-safe-top');
    expect(marked('components/CommunityHome.tsx')).toBe(true);
    expect(marked('components/TripWorkspaceShell.tsx')).toBe(true);
    expect(marked('components/TripSelectionScreen.tsx')).toBe(true);
    expect(marked('App.tsx')).toBe(true);
  });

  it('底部的安全區域沒有被動到', () => {
    expect(read('components/AppBottomNav.tsx')).toContain('env(safe-area-inset-bottom)');
    expect(read('components/TripWorkspaceShell.tsx')).toContain('env(safe-area-inset-bottom)');
  });
});
