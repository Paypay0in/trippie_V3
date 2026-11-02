import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sectionIsExpected } from '../services/tripSections';

/**
 * 「我覺得像是租車與航班資訊 應該是用戶在建立旅程時有點選才需要出現」.
 *
 * Four directions, and three of them are the ones that get lost.
 *
 * 1. Said 火車 → the flight forms and the rental card are not what the trip
 *    opens with. This is the ask.
 * 2. Said nothing → everything opens. Absent is not 'no'; the same answer the
 *    entry-rules block gives an unresolved scope, for the same reason.
 * 3. Said 火車 but a flight is already on the trip → the section shows anyway.
 *    A gate that hides data the traveller already entered is worse than no
 *    gate, and this is the half a careless reading deletes.
 * 4. Scope decides nothing here. 松山→澎湖 is a domestic flight and a border
 *    can be crossed by train, so the earlier tripScope-keyed version
 *    (ab4f2d8) was a guess wearing a rule's clothes.
 */

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

describe('a trip that said how it travels', () => {
  it('opens with the flight forms when a flight was named', () => {
    expect(sectionIsExpected('flights', ['flight'])).toBe(true);
    expect(sectionIsExpected('rental', ['drive'])).toBe(true);
  });

  it('does not open with sections the stated plan does not use', () => {
    expect(sectionIsExpected('flights', ['train'])).toBe(false);
    expect(sectionIsExpected('rental', ['train', 'walk'])).toBe(false);
  });

  it('reads every mode, not just the first', () => {
    expect(sectionIsExpected('flights', ['train', 'flight'])).toBe(true);
    expect(sectionIsExpected('rental', ['transit', 'drive'])).toBe(true);
  });
});

describe('a trip that said nothing', () => {
  /*
    Nobody said is not 'no'. Hiding a field on an absent answer is how a
    traveller discovers there is nowhere to type their flight number.
  */
  it('opens with everything', () => {
    expect(sectionIsExpected('flights', undefined)).toBe(true);
    expect(sectionIsExpected('flights', [])).toBe(true);
    expect(sectionIsExpected('rental', undefined)).toBe(true);
    expect(sectionIsExpected('rental', [])).toBe(true);
  });
});

describe('the gate in App.tsx', () => {
  /*
    One home each. Both sections render twice in this file, and a condition
    written at each call site is how one of them keeps the older rule — the
    defect shape this repo has produced a dozen times this week.
  */
  it('is written once per section, not at each call site', () => {
    expect(APP.split('{flightAnchorsSection}')).toHaveLength(3);
    expect(APP.split('{rentalCard}')).toHaveLength(3);
    expect(APP.split("sectionIsExpected('flights'")).toHaveLength(2);
    expect(APP.split("sectionIsExpected('rental'")).toHaveLength(2);
  });

  /*
    Entered data outranks the stated plan. Written here rather than only in
    the module because the module cannot see the trip's anchors.
  */
  it('shows a section the trip already has data for', () => {
    expect(APP).toContain("sectionIsExpected('flights', tripTransport) || flightAnchors.length > 0");
    expect(APP).toContain("sectionIsExpected('rental', tripTransport) || carRentals.length > 0");
  });

  /*
    Collapsed, not deleted. A disclosure keeps the form reachable; removing
    the section would lose a 澎湖 traveller's flight.
  */
  it('keeps an unexpected section one tap away', () => {
    expect(APP).toContain('OptionalPlanSection');
    expect(APP).toContain('flights-section-disclosure');
    expect(APP).toContain('rental-section-disclosure');
  });

  /*
    And it is restored and reset everywhere the scope is. Tonight's defect was
    exactly this list being one shorter in one of the paths.
  */
  it('carries the choice through every per-trip path', () => {
    expect(APP).toContain('setTripTransport(draft.tripTransport)');
    expect(APP).toContain('setTripTransport(trip.tripTransport)');
    expect(APP.split('setTripTransport(undefined)')).toHaveLength(3);
  });
});
