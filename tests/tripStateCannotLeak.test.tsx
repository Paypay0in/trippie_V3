import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 「我建立沖繩行程 裏面有這個機票資訊」 — the flights in a brand new Okinawa
 * trip were the Busan trip's, TPE→PUS on 10/02, marked 已儲存.
 *
 * An effect writes the app-level trip state into whichever draft is active.
 * So anything that effect writes but a trip change does not reset does not
 * merely look stale: it is written into the next trip and synced as its own.
 * Flight anchors also generate itinerary items, so an Okinawa day was being
 * built around a Gimhae arrival.
 *
 * The create path used to hand-reset that state and its list was five short —
 * flightAnchors, flightMode, savedInspirations, settlementBatches and
 * companions all survived. The fix was to make it hydrate like every other
 * way of opening a trip, but the fix is not what keeps it fixed: a sixth
 * field added to the autosave tomorrow leaks exactly the same way.
 *
 * So this asserts the invariant rather than the fix. Every field the autosave
 * persists must have a reset in `hydrateDraft`. It reads the source because
 * that is where the pairing lives; a runtime test can only catch the fields
 * somebody remembered to write a case for, which is the same memory that
 * missed these five.
 */

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

/** The object literal the autosave effect spreads into the active draft. */
const persistedFields = (): string[] => {
  /*
    Anchored on the one line only this effect has. `draft.id ===
    activeDraftId` appears seventeen times in App.tsx, and an earlier version
    of this test read a different one of them — which is the same mistake in
    miniature: looking confidently at the wrong thing.
  */
  const anchor = APP.indexOf('flightAnchors.length > 0 ? [...flightAnchors] : undefined');
  expect(anchor).toBeGreaterThan(-1);
  const start = APP.lastIndexOf('draft.id === activeDraftId', anchor);
  expect(start).toBeGreaterThan(-1);
  const body = APP.slice(start, APP.indexOf('updatedAt: new Date().toISOString()', anchor));
  /*
    Both spellings. `settlementBatches,` and `flightMode,` are written in
    shorthand, and they are two of the five fields that leaked — a matcher
    that only saw `field:` would have declared this file clean while the bug
    was still there.
  */
  return Array.from(new Set([
    ...Array.from(body.matchAll(/^\s+([a-zA-Z]+):/gm)).map(match => match[1]),
    ...Array.from(body.matchAll(/^\s+([a-zA-Z]+),\s*$/gm)).map(match => match[1]),
  ]));
};

const hydrateBody = (): string => {
  const start = APP.indexOf('const hydrateDraft = (draft: TripDraft) => {');
  expect(start).toBeGreaterThan(-1);
  return APP.slice(start, start + 4000);
};

/**
 * Fields the draft carries that are not app-level state, so there is nothing
 * for hydrating to reset. Each is listed on purpose: adding to this is a
 * decision, which is the point of making it explicit.
 */
const NOT_STATE = new Set([
  'updatedAt', // stamped on every write
  'name',      // setDraftName, under a different name
]);

/** Setter names that differ from the field they persist. */
const SETTER_ALIASES: Record<string, string> = {
  destination: 'setTripDestination',
  startDate: 'setTripStartDate',
  endDate: 'setTripEndDate',
  currency: 'setTripCurrency',
  budget: 'setTripBudget',
  name: 'setDraftName',
};

describe('what a trip change must reset', () => {
  it('finds the fields the autosave writes', () => {
    const fields = persistedFields();
    // A guard on the guard: if the effect is refactored and this stops
    // finding anything, the test must fail loudly rather than pass empty.
    expect(fields.length).toBeGreaterThan(10);
    expect(fields).toContain('flightAnchors');
    expect(fields).toContain('settlementBatches');
  });

  it('resets every one of them when a trip is opened', () => {
    const body = hydrateBody();
    const missing = persistedFields()
      .filter(field => !NOT_STATE.has(field))
      .filter(field => {
        const setter = SETTER_ALIASES[field]
          || `set${field[0].toUpperCase()}${field.slice(1)}`;
        return !body.includes(`${setter}(`);
      });

    expect(missing).toEqual([]);
  });
});

describe('creating a trip', () => {
  /**
   * The actual defect was two code paths doing one job, one of them short.
   * Creating a trip goes through the same hydration as opening one.
   */
  it('opens the new trip the same way every other trip is opened', () => {
    const start = APP.indexOf('if (tripSetupMode === "create") {');
    expect(start).toBeGreaterThan(-1);
    const branch = APP.slice(start, APP.indexOf('showToast("新旅程已建立', start));
    expect(branch).toContain('hydrateDraft(newDraft)');
  });

  it('does not hand-reset the state hydrating already handles', () => {
    const start = APP.indexOf('if (tripSetupMode === "create") {');
    const branch = APP.slice(start, APP.indexOf('showToast("新旅程已建立', start));
    for (const setter of ['setExpenses(', 'setItinerary(', 'setShoppingList(']) {
      expect(branch).not.toContain(setter);
    }
  });
});
