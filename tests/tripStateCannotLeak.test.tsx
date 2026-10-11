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

/**
 * The third place, found the hard way.
 *
 * 「AI一開始問卷結局沒有紀錄起來」 — the brief saved into the draft and came back
 * undefined, because loading rebuilds a draft field by field from a list
 * written by hand, and nobody added it. Tonight's leak test checked the
 * autosave against `hydrateDraft` and never knew this file existed.
 *
 * A field has to appear in all three or it is broken in a way that only
 * shows up after a reload — which is the slowest possible way to find out.
 */
describe('what survives being reloaded', () => {
  const PERSISTENCE = readFileSync(
    resolve(__dirname, '../services/tripPersistence.ts'), 'utf8',
  );

  it('rebuilds every field the autosave persists', () => {
    /*
      The rebuild is the `return {` that produces a TripDraft, anchored on a
      field only it has. An earlier version of this test took a fixed window
      of characters around that field and reported eighteen false gaps —
      including `destination`, which is three lines into the block.
    */
    const anchor = PERSISTENCE.indexOf('travelRuleTaskState: normalizeTravelRuleTaskState');
    expect(anchor).toBeGreaterThan(-1);
    const start = PERSISTENCE.lastIndexOf('  return {', anchor);
    const rebuild = PERSISTENCE.slice(start, PERSISTENCE.indexOf('\n  };', anchor));
    const missing = persistedFields()
      .filter(field => !NOT_STATE.has(field))
      .filter(field => !rebuild.includes(`${field}:`) && !rebuild.includes(`${field},`));

    expect(missing).toEqual([]);
  });

  it('carries the two that were being dropped', () => {
    expect(PERSISTENCE).toContain('planBrief:');
    expect(PERSISTENCE).toContain('carRentals:');
  });
});

/**
 * The fourth place, found the same way as the third.
 *
 * 「只要我關掉重開 這個都是空白的」.
 *
 * `hydrateDraft` is never called on a cold start. The app opens straight into
 * the active trip by seeding each piece of state from `initialActiveDraft`,
 * one hand-written line at a time — a fourth list, and the only one that runs
 * before anybody touches the screen.
 *
 * A field missing here is worse than a field missing from the loader, because
 * it does not merely fail to load: the autosave effect writes the empty state
 * straight back over the stored draft on the first change. Saving works, and
 * the next launch erases it.
 */
describe('what a cold start opens with', () => {
  /**
   * Fields seeded from somewhere other than the stored draft, each for a
   * reason that is written down. Adding to this is a decision.
   */
  const SEEDED_ELSEWHERE = new Set([
    'updatedAt', // stamped on write; never read back into state
  ]);

  it('seeds every field the autosave persists', () => {
    // A cold start reads the draft once, before render. If that disappears,
    // nothing below means anything.
    expect(APP).toContain('const initialActiveDraft = initialDraftStore.drafts.find(');

    const missing = persistedFields()
      .filter(field => !SEEDED_ELSEWHERE.has(field))
      .filter(field => !APP.includes(`initialActiveDraft?.${field}`)
        && !APP.includes(`initialActiveDraft.${field}`));

    expect(missing).toEqual([]);
  });

  /**
   * Both were declared two hundred lines above `initialActiveDraft`, so they
   * could not have been seeded from it even by somebody trying.
   */
  it('declares them where the stored draft can be read', () => {
    const draftRead = APP.indexOf('const initialActiveDraft =');
    expect(APP.indexOf('const [planBrief, setPlanBrief]')).toBeGreaterThan(draftRead);
    expect(APP.indexOf('const [carRentals, setCarRentals]')).toBeGreaterThan(draftRead);
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

/**
 * 「是租兩天的車等 但旅行有五天 因此先不要直接預設交通馬上排用租車
 *   應該要先記錄下來 然後在安排AI規劃行程時給用戶建議或了解用戶目前想法」
 *
 * The brief's transport is a capability, not a schedule. 開車 means a car
 * exists on this trip, not that every leg is driven — defaulting five days of
 * transport from a two-day rental is a decision nobody made, applied to three
 * days they never said anything about.
 *
 * So it is recorded and nothing acts on it. This pins that, because the wiring
 * is one line away and looks like a kindness.
 */
describe('the brief is recorded, not applied', () => {
  const TRANSPORT_LEG = readFileSync(
    resolve(__dirname, '../components/TransportLeg.tsx'), 'utf8',
  );

  it('does not let the brief pick the travel mode for a leg', () => {
    expect(TRANSPORT_LEG).not.toContain('planBrief');
    expect(TRANSPORT_LEG).not.toContain('tripPlanBrief');
  });

  /** Every leg still starts where it always did, until somebody chooses. */
  it('leaves the leg default exactly as it was', () => {
    expect(TRANSPORT_LEG).toContain("useState<TravelMode>('TRANSIT')");
  });

  /**
   * Creating a trip hydrates from the draft, and hydrating resets planBrief
   * like everything else — so a brief set before that call is wiped by it.
   */
  it('puts the brief on the draft rather than setting it around the hydrate', () => {
    const start = APP.indexOf('const handleGenerateFromBrief');
    expect(start).toBeGreaterThan(-1);
    const body = APP.slice(start, start + 500);
    expect(body).not.toContain('setPlanBrief(');
    expect(APP).toContain('planBrief: brief,');
  });
});
