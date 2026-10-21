/**
 * @vitest-environment jsdom
 *
 * 「旅程結束後的總覽 是帳目的」.
 *
 * It was. 旅程回顧 was reachable only from the row of tiles that a trip in
 * progress draws, so the screen written entirely for looking back could not be
 * opened from the one stage that is entirely about looking back — a finished
 * trip's overview offered the settlement report and nothing else.
 *
 * Read off App.tsx rather than rendered: this is a wiring fact — which branch
 * carries the way in — and the branch is picked by a phase computed from the
 * trip's own dates, a long way above any component this could mount.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');

/** The finished-trip overview, from its guard to the end of its block. */
const finishedOverview = (() => {
  const start = app.indexOf('(currentPhase === "post" || currentPhase === "summary")');
  expect(start).toBeGreaterThan(-1);
  return app.slice(start, start + 2600);
})();

describe('the overview of a trip that is over', () => {
  it('offers 旅程回顧', () => {
    expect(finishedOverview).toContain('finished-trip-open-recap');
    expect(finishedOverview).toContain('setRecapOpen(true)');
  });

  /*
    Above the report, not instead of it. What a finished trip was is the days
    and the places; what it cost is the detail underneath — and the report is
    Founder-approved, so it is added to rather than replaced.
  */
  it('still shows the settlement report, under it', () => {
    expect(finishedOverview).toContain('TripSummaryModal');
    expect(finishedOverview.indexOf('finished-trip-open-recap'))
      .toBeLessThan(finishedOverview.indexOf('TripSummaryModal'));
  });
});
