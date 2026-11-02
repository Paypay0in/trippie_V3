import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 「我選了國內旅遊 還是問我入境規定」 — a 新莊 trip, classified 國內 when it was
 * created, asking for entry rules every time it was opened from the shelf.
 *
 * The choice was never lost. `tripPersistence` stores `tripScope` and the
 * draft path restores it with a comment saying why it must. The shelf path,
 * `handleOpenCompletedTrip`, restores travelCountry, taxRule, visaInfo,
 * comparisonCountryCode and the travel book — and leaves `tripScope` at
 * whatever the previous trip left in app state.
 *
 * Both directions are defects, and the quiet one is the dangerous one. A
 * domestic trip that keeps asking about a border is noise. A trip to Japan
 * opened after a weekend in 台南 inherits 'domestic' and *hides* the entry
 * rules, which is the exact leak `tripStateCannotLeak` exists to prevent —
 * discovered at the airport, not on the screen.
 *
 * This reads the source for the same reason that test does: the pairing lives
 * there. `handleOpenCompletedTrip` already carries a comment claiming it
 * "needs the same rule" as the draft path, so a runtime case would only have
 * caught the field somebody remembered to write a case for — and the comment
 * is evidence that memory is exactly what failed here.
 */

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

/** The body of one top-level handler, by name. */
const handlerBody = (name: string): string => {
  const start = APP.indexOf(`const ${name} = (`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = APP.indexOf('\n  const ', start + 1);
  expect(next).toBeGreaterThan(start);
  return APP.slice(start, next);
};

describe('a trip opened from the shelf', () => {
  it('restores its own scope instead of inheriting the last one', () => {
    const body = handlerBody('handleOpenCompletedTrip');
    expect(body).toContain('setTripScope(');
  });

  /*
    Restored, not re-derived. `effectiveTripScope` would answer 'unknown' for
    a traveller who never stated a residence, and deriving here would also
    reclassify every trip the day somebody moves house. The stored answer is
    the one the traveller gave.
  */
  it('reads the scope the traveller stored on that trip', () => {
    expect(handlerBody('handleOpenCompletedTrip')).toContain('trip.tripScope');
  });

  /*
    The draft path is the reference implementation, not a second rule. If it
    ever stops restoring the scope this test should fail too, rather than
    quietly measuring the shelf path against nothing.
  */
  it('agrees with the draft path, which already does this', () => {
    expect(APP).toContain('setTripScope(draft.tripScope)');
  });
});
