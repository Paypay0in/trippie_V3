/**
 * 「本機的還是沒有」 — said four times, about a trip that was on one device and
 * not in the account, with both screens looking perfectly normal.
 *
 * The rule being tested is mostly about silence: say nothing while the answer
 * is unknown, say nothing that repeats itself on every card, and say both
 * numbers when they disagree.
 */
import { describe, expect, it } from 'vitest';
import { cloudPresenceSummary, isOnlyOnThisDevice } from './tripCloudPresence';

const cloud = (...ids: string[]) => new Set(ids);

describe('isOnlyOnThisDevice', () => {
  it('marks a trip the account has never seen', () => {
    expect(isOnlyOnThisDevice('busan', cloud('tokyo'), true)).toBe(true);
  });

  it('leaves a published trip alone', () => {
    expect(isOnlyOnThisDevice('tokyo', cloud('tokyo'), true)).toBe(false);
  });

  /*
    Before the fetch returns, every trip would wear the badge. A warning that
    cries wolf on every cold start is one nobody reads on the day it is true.
  */
  it('says nothing until the cloud list is known', () => {
    expect(isOnlyOnThisDevice('busan', undefined, true)).toBe(false);
  });

  /* Signed out, nothing is uploaded; one line covers it, not ten badges. */
  it('says nothing on every card when signed out', () => {
    expect(isOnlyOnThisDevice('busan', cloud(), false)).toBe(false);
  });
});

describe('cloudPresenceSummary', () => {
  it('gives both counts and the gap', () => {
    const summary = cloudPresenceSummary(
      ['a', 'b', 'c'], cloud('a'), true,
    );

    expect(summary.text).toBe('本機 3 趟・雲端 1 趟・2 趟還沒上傳');
    expect(summary.behind).toBe(true);
  });

  /* Nothing to report is nothing on the screen. */
  it('is silent when everything is published', () => {
    expect(cloudPresenceSummary(['a'], cloud('a'), true))
      .toEqual({ text: '', behind: false });
  });

  it('is silent while the cloud list is still unknown', () => {
    expect(cloudPresenceSummary(['a'], undefined, true))
      .toEqual({ text: '', behind: false });
  });

  it('tells a signed-out traveller their trips are device-only', () => {
    expect(cloudPresenceSummary(['a'], undefined, false).text)
      .toBe('未登入，這些旅程只存在這台裝置');
  });

  /* Signed out with nothing on the device is not a warning about anything. */
  it('is silent when signed out with no trips', () => {
    expect(cloudPresenceSummary([], undefined, false))
      .toEqual({ text: '', behind: false });
  });
});
