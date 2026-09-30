/**
 * What happens after a link tries to open a native app.
 *
 * The whole mechanism is a guess dressed as a measurement — iOS never says
 * whether the scheme was handled. These pin the two signals it is guessed
 * from, because getting either wrong sends the traveller to a web page on top
 * of the app that just opened.
 */
import { describe, expect, it } from 'vitest';
import { FALLBACK_DELAY_MS, openAppWithFallback, LaunchEnvironment } from './appLaunch';

const environment = (overrides: Partial<LaunchEnvironment> & { elapsedMs?: number } = {}) => {
  const visited: string[] = [];
  let clock = 1_000;
  const scheduled: Array<() => void> = [];

  const env: LaunchEnvironment = {
    navigate: url => visited.push(url),
    schedule: callback => scheduled.push(callback),
    now: () => clock,
    isHidden: () => false,
    ...overrides,
  };

  return {
    env,
    visited,
    /** Runs the pending callback, having advanced the clock as a phone would. */
    fire: (elapsedMs = FALLBACK_DELAY_MS) => {
      clock += elapsedMs;
      scheduled.forEach(callback => callback());
    },
  };
};

describe('when the app is not installed', () => {
  it('lands on the web page instead of nowhere', () => {
    // The scheme fails silently on iOS. Without this the link is inert: no
    // app, no page, no error — just a tap that did nothing.
    const { env, visited, fire } = environment();
    openAppWithFallback('shoebox://', 'https://support.apple.com/105079', env);
    fire();

    expect(visited).toEqual(['shoebox://', 'https://support.apple.com/105079']);
  });
});

describe('when the app opened', () => {
  it('does not follow with the web page once the page is hidden', () => {
    const { env, visited, fire } = environment({ isHidden: () => true });
    openAppWithFallback('shoebox://', 'https://support.apple.com/105079', env);
    fire();

    expect(visited).toEqual(['shoebox://']);
  });

  it('does not follow when the timer ran late, which means it was suspended', () => {
    // iOS freezes this page's timers while another app is frontmost. A
    // callback that arrives seconds late is running on the way back, after
    // Wallet was already open — loading the article then would replace what
    // the traveller came for. Visibility alone misses this on older iOS.
    const { env, visited, fire } = environment();
    openAppWithFallback('shoebox://', 'https://support.apple.com/105079', env);
    fire(6_000);

    expect(visited).toEqual(['shoebox://']);
  });

  it('still falls back when the phone was merely slow', () => {
    // A little over the delay is an ordinary busy main thread, not a launch.
    const { env, visited, fire } = environment();
    openAppWithFallback('shoebox://', 'https://support.apple.com/105079', env);
    fire(FALLBACK_DELAY_MS + 200);

    expect(visited).toHaveLength(2);
  });
});
