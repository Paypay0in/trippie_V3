import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planningDestination } from './planningDestination';

/**
 * 「我的旅策地點是沖繩 已經明確寫了 結果出現東京的方案…」
 *
 * The request asked for plans in 日本 because the country was preferred over
 * the place. Tokyo is in Japan; the model answered correctly.
 */

describe('where a plan is for', () => {
  it('keeps the specific place, not the country around it', () => {
    expect(planningDestination('日本沖繩', '日本')).toBe('日本沖繩');
  });

  /** 「沖繩」 alone is ambiguous to a search that does not already know. */
  it('adds the country when the place has not said it', () => {
    expect(planningDestination('沖繩', '日本')).toBe('日本 沖繩');
  });

  it('does not say the country twice', () => {
    expect(planningDestination('日本 東京', '日本')).toBe('日本 東京');
  });

  it('falls back to the country when there is no place', () => {
    expect(planningDestination('', '日本')).toBe('日本');
    expect(planningDestination(undefined, '日本')).toBe('日本');
  });

  it('uses the place when there is no country', () => {
    expect(planningDestination('沖繩', '')).toBe('沖繩');
  });

  it('tidies the spacing a phone keyboard leaves', () => {
    expect(planningDestination('  日本   沖繩 ', '日本')).toBe('日本 沖繩');
  });
});

describe('the planner asks for the right place', () => {
  const CARD = readFileSync(
    resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8',
  );

  /**
   * The three requests that produced a Tokyo plan for an Okinawa trip.
   *
   * Not every use of the country was wrong, which is why this names the ones
   * that were. Official links go to 日本外務省 and the 入境規定 field says 日本:
   * those are country questions and a blanket replacement would have broken
   * them while fixing this.
   */
  it('sends the place on every request that is about a place', () => {
    // Three to the planner — generate, revise, and the one behind a tapped
    // plan — and two for human help. Counted rather than described, because
    // the first version of this test said three and there were five.
    const asks = CARD.split('destination: planningDestination(destination, destinationCountry)');
    expect(asks.length - 1).toBe(5);
  });

  it('searches for real places in the place, not in the country', () => {
    expect(CARD).toContain('const place = planningDestination(destination, destinationCountry)');
  });

  /** A helper in Okinawa, not 「somebody in Japan」. */
  it('asks for human help where the traveller actually is', () => {
    // The default topic moved into the locale bundles; the point of this test
    // is the destination it is asked with, not the wording of the topic.
    expect(CARD).toContain(
      "topic: prompt.trim() || t('plan.defaultHelpTopic'), destination: planningDestination",
    );
  });

  it('leaves the country questions asking about the country', () => {
    // officialLinkFor and the 入境規定 field still take the country.
    expect(CARD).toContain('officialLinkFor(ruleTask, destinationCountry || destination)');
  });
});

/**
 * Defence in depth, because the request was not the only thing that failed.
 *
 * The plan said 「單程約 41 小時 11 分」 on its own card — the route service had
 * already measured Okinawa to Fuji and nothing treated that as the
 * contradiction it was.
 */
describe('the prompt refuses to leave the destination', () => {
  const SERVER = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

  it('bounds a plan to the place, not the country', () => {
    expect(SERVER).toContain('方案必須在 ${destination} 當地或一日可來回的範圍內');
    expect(SERVER).toContain('使用者填的是這個目的地，不是這個國家');
  });

  /** Named, so the exact failure cannot come back unnoticed. */
  it('names the journey that happened', () => {
    expect(SERVER).toContain('目的地是沖繩就不要提東京或富士山');
  });

  it('rules out the flight that made it possible', () => {
    expect(SERVER).toContain('需要搭國內線、跨島、或單程超過 4 小時交通');
  });
});
