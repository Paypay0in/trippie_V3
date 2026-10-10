/**
 * @vitest-environment jsdom
 *
 * 「關掉重開」, said once too often.
 *
 * An evening went to a fault that was fixed on the server while the phone kept
 * running the build from before the fix — and nothing on either side could say
 * so, so every answer ended in advice rather than an answer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StaleBuildBanner from '../components/StaleBuildBanner';
import { AUTO_RELOAD_STORAGE_KEY, isStaleBuild, shouldAutoReload } from '../services/staleBuild';

/*
  A test run has no build stamp — vitest never defines `__BUILD_ID__`, so the
  real one reads `dev`, which the comparison deliberately treats as 「unknown,
  say nothing」. Standing in a build that knows what it is.
*/
vi.mock('../services/buildStamp', () => ({ BUILD_ID: 'aaaaaaa' }));
const BUILD_ID = 'aaaaaaa';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const serving = (commit: string) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true, json: async () => ({ commit }),
})));

describe('knowing the build is old', () => {
  it('says nothing when the device is running what is deployed', async () => {
    serving(BUILD_ID);
    render(<StaleBuildBanner />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('stale-build-banner')).toBeNull();
  });

  it('offers a reload when the server is serving something else', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);

    expect((await screen.findByTestId('stale-build-banner')).textContent).toContain('新版本');
  });

  /**
   * 「點不到」.
   *
   * The app renders with viewport-fit=cover, so the top of the page is the top
   * of the glass and every screen pads itself past the status bar. This banner
   * was mounted beside App and never learned the rule, so it drew itself into
   * the strip the clock owns — where iOS takes the taps, and the one control
   * whose whole purpose is to be tapped could not be.
   */
  it('坐在狀態列底下，不是躲在它後面', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);
    const banner = await screen.findByTestId('stale-build-banner');

    expect(banner.style.paddingTop).toContain('env(safe-area-inset-top)');
  });

  it('浮在畫面上，不是插在版面裡再疊一層留白', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);
    const banner = await screen.findByTestId('stale-build-banner');

    expect(banner.className).toContain('fixed');
    expect(banner.className).toContain('top-0');
  });

  it('stays quiet when the version cannot be fetched', async () => {
    // Offline on a subway platform is not evidence of a stale build.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<StaleBuildBanner />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('stale-build-banner')).toBeNull();
  });
});

describe('the comparison itself', () => {
  it('is silent in every uncertain case', () => {
    // A local build stamps `dev`, and a banner that cries wolf in development
    // is a banner nobody reads in Busan.
    expect(isStaleBuild('dev', 'abcdef1')).toBe(false);
    expect(isStaleBuild('abcdef1', 'dev')).toBe(false);
    expect(isStaleBuild('', 'abcdef1')).toBe(false);
    expect(isStaleBuild('abcdef1', undefined)).toBe(false);
  });

  it('reports only a real difference', () => {
    expect(isStaleBuild('abcdef1', 'abcdef1')).toBe(false);
    expect(isStaleBuild('abcdef1', '1234567')).toBe(true);
  });
});

/**
 * 「點不到」, and the deadlock under it.
 *
 * The app is a Safari home-screen shortcut, so iOS resumes the page it had
 * rather than loading a new one. The only control that fetched a newer build
 * was the update banner — and the evening the banner itself shipped with its
 * tap target under the status bar, the fix for it could not be reached from
 * inside the app at all.
 *
 * A stale build heals itself now. These are the conditions that keep that from
 * being worse than the problem it solves.
 */
/**
 * The decision being right does not prove the component asks it.
 *
 * What the traveller experiences is the page reloading on its own when they
 * come back — so that is what is exercised: the real component, a real
 * visibilitychange, and the reload it is supposed to call.
 */
describe('自己把自己救回來', () => {
  const reload = vi.fn();

  const comeBackToTheApp = async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  };

  beforeEach(() => {
    reload.mockClear();
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  it('切回 app 時發現版本舊了，就自己重新載入', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);
    await screen.findByTestId('stale-build-banner');

    await comeBackToTheApp();

    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('第一次開啟不會自己重整 —— 那是會無限循環的那一種', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);
    await screen.findByTestId('stale-build-banner');

    expect(reload).not.toHaveBeenCalled();
  });

  it('版本一樣的時候不會亂重整', async () => {
    serving(BUILD_ID);
    render(<StaleBuildBanner />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    await comeBackToTheApp();

    expect(reload).not.toHaveBeenCalled();
  });

  it('同一個版本只救一次，救不起來就改回問你', async () => {
    sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, 'abcdef1');
    serving('abcdef1');
    render(<StaleBuildBanner />);
    await screen.findByTestId('stale-build-banner');

    await comeBackToTheApp();

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('stale-build-banner')).toBeTruthy();
  });

  it('重整過以後會記下來，不會每次切回來都重整', async () => {
    serving('abcdef1');
    render(<StaleBuildBanner />);
    await screen.findByTestId('stale-build-banner');

    await comeBackToTheApp();

    await waitFor(() => expect(sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBe('abcdef1'));
  });
});

describe('shouldAutoReload', () => {
  const base = {
    deployed: 'abc1234',
    trigger: 'foreground' as const,
    alreadyReloadedFor: null,
  };

  it('reloads when the reader comes back to a version that has moved on', () => {
    expect(shouldAutoReload(base)).toBe(true);
  });

  /**
   * A reload at first paint is the one that can loop: if something other than
   * a stale cache is making the versions disagree, the page would reload,
   * disagree again, and reload again.
   */
  it('never on first paint', () => {
    expect(shouldAutoReload({ ...base, trigger: 'load' })).toBe(false);
  });

  it('never out from under someone typing', () => {
    expect(shouldAutoReload({ ...base, focusedTag: 'INPUT' })).toBe(false);
    expect(shouldAutoReload({ ...base, focusedTag: 'textarea' })).toBe(false);
    expect(shouldAutoReload({ ...base, focusedTag: 'SELECT' })).toBe(false);
    expect(shouldAutoReload({ ...base, isEditing: true })).toBe(false);
  });

  it('a focused button is not someone typing', () => {
    expect(shouldAutoReload({ ...base, focusedTag: 'BUTTON' })).toBe(true);
  });

  /**
   * If one reload does not resolve the disagreement, another will not either,
   * and an app that reloads every time it is opened is unusable.
   */
  it('once per deployed commit, then it goes back to asking', () => {
    expect(shouldAutoReload({ ...base, alreadyReloadedFor: 'abc1234' })).toBe(false);
  });

  it('but a newer deploy earns a fresh attempt', () => {
    expect(shouldAutoReload({ ...base, alreadyReloadedFor: 'older99' })).toBe(true);
  });

  it('silent in development, like the banner', () => {
    expect(shouldAutoReload({ ...base, deployed: 'dev' })).toBe(false);
    expect(shouldAutoReload({ ...base, deployed: '' })).toBe(false);
  });
});
