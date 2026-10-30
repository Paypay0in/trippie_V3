import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 「為什麼連不上搜尋」.
 *
 * Because the project's Google Search allowance was spent. Measured against
 * this project's key rather than reasoned about:
 *
 *   gemini-3-flash-preview   plain 429   search 429
 *   gemini-3.5-flash         plain OK    search 429
 *   gemini-3.5-flash-lite    plain OK    search 429
 *   gemini-3.1-flash-lite    plain OK    search 429
 *
 * Two things follow, and both are what this file guards.
 *
 * The model ladder cannot rescue a grounded call. It exists because the
 * per-model daily quota is genuinely separate — four models are four
 * allowances — but grounding is metered once for the whole project. Walking
 * the ladder spends four failed calls before the ungrounded retry starts,
 * and the traveller waits out every one.
 *
 * And the banner has to say why. It could only say that it had fallen back,
 * so the one way to answer the question was to read the server's logs.
 */

const SERVER = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');
const CARDS = readFileSync(resolve(__dirname, '../components/ActivityPlanCards.tsx'), 'utf8');
// The two wordings moved into the locale bundles with the rest of this screen.
// Read from the fallback language, which is the one the banner was written in.
const ZH_HANT = JSON.parse(readFileSync(resolve(__dirname, '../i18n/locales/zh-Hant.json'), 'utf8'));

describe('a grounded call that is out of quota', () => {
  it('stops instead of asking three more models the same question', () => {
    expect(SERVER).toContain('stopOnQuota?: boolean,');
    expect(SERVER).toContain('if (stopOnQuota && isQuotaError(error)) throw error;');
  });

  /**
   * Only the grounded attempt. The ungrounded retry must keep walking the
   * ladder — that quota really is per model, which is the whole reason the
   * ladder was built, and short-circuiting it would throw away three working
   * allowances on the one path that still has them.
   */
  it('short-circuits the search attempt and not the plain one', () => {
    /*
      Anchored forward from the definition, not to the file's first
      `let response;` — that one belongs to the travel-rules route hundreds of
      lines above, and slicing to it produced an empty string that passed
      nothing and failed loudly only because the assertion was positive.
    */
    const start = SERVER.indexOf('const generate = (useSearch: boolean) =>');
    expect(start).toBeGreaterThan(-1);
    const call = SERVER.slice(start, SERVER.indexOf('let response;', start));
    // The flag is the caller's own `useSearch`, so the ungrounded retry —
    // generate(false) — passes false and keeps walking the ladder.
    expect(call).toContain('useSearch,');
    expect(SERVER).toContain('response = await generate(false);');
  });
});

describe('the banner says why', () => {
  it('separates a spent allowance from a failure', () => {
    expect(CARDS).toContain("ungroundedReason === 'quota'");
    expect(ZH_HANT.activityPlan.ungroundedQuota).toContain('今天的搜尋額度已經用完');
    // The original wording stays for every other cause: a failure is worth
    // retrying now, and telling somebody their allowance ran out when it did
    // not would send them away for a day.
    expect(ZH_HANT.activityPlan.ungroundedError).toContain('這次沒有連上搜尋');
  });

  it('is carried from the server rather than guessed on the client', () => {
    expect(SERVER).toContain('ungroundedReason = isQuotaError(groundedError) ? "quota" : "error";');
    expect(SERVER).toContain('        ungroundedReason,');
  });
});
