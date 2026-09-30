/**
 * Opening a native app from a link, and landing somewhere useful when it is
 * not installed.
 *
 * 「Apple：在 Wallet 加入交通卡」 opened a support article. The article is
 * correct, but reading instructions for an app is not the same as being in it,
 * and the traveller has to leave the page, find Wallet, and repeat the steps
 * from memory.
 *
 * A custom scheme fixes that and fails silently: iOS neither opens anything
 * nor reports an error, so a link that is only `shoebox://` does nothing at
 * all on a device without Wallet. So the scheme is tried first and the web
 * page follows shortly after, unless the app took over.
 */

/** How long to wait before deciding the app did not open. */
export const FALLBACK_DELAY_MS = 900;

/**
 * Extra time beyond the delay that means the page was suspended.
 *
 * When iOS hands off to another app it freezes this page's timers. A callback
 * scheduled for 900ms that runs 4 seconds later did not run late — it ran on
 * the way back, after the app had already opened and been dismissed.
 */
const SUSPENDED_SLACK_MS = 600;

export interface LaunchEnvironment {
  navigate: (url: string) => void;
  schedule: (callback: () => void, delayMs: number) => void;
  now: () => number;
  /** Whether this page is no longer frontmost — the app took over. */
  isHidden: () => boolean;
}

/**
 * Tries the app, then the web page.
 *
 * Both signals are checked because neither is sufficient alone: visibility
 * does not always flip before the timer on older iOS, and a phone that simply
 * ran slowly would otherwise be read as a successful launch.
 */
export const openAppWithFallback = (
  appUrl: string,
  webUrl: string,
  environment: LaunchEnvironment,
): void => {
  const startedAt = environment.now();
  environment.navigate(appUrl);

  environment.schedule(() => {
    if (environment.isHidden()) return;
    if (environment.now() - startedAt > FALLBACK_DELAY_MS + SUSPENDED_SLACK_MS) return;
    environment.navigate(webUrl);
  }, FALLBACK_DELAY_MS);
};

/** The browser wiring, kept apart so the decision above stays testable. */
export const browserLaunchEnvironment = (): LaunchEnvironment => ({
  navigate: url => { window.location.href = url; },
  schedule: (callback, delayMs) => { window.setTimeout(callback, delayMs); },
  now: () => Date.now(),
  isHidden: () => document.visibilityState === 'hidden',
});
