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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StaleBuildBanner from '../components/StaleBuildBanner';
import { isStaleBuild } from '../services/staleBuild';

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
