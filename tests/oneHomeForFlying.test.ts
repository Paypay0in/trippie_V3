import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tripInvolvesFlying } from '../services/tripInvolvesFlying';
import { sectionIsExpected } from '../services/tripSections';
import { missingAnchors } from '../services/planningAnchors';
import type { FlightAnchor } from '../types';

/**
 * 「國內旅遊又出現了飛機」 / 「怎麼一直在修重複的問題」.
 *
 * ab4f2d8 (2026-11-02) stopped a domestic trip being asked for a boarding
 * pass. Three weeks later the Founder saw a full boarding-pass form on a 花蓮
 * trip, and he was right that it was the same complaint: the fix had landed in
 * `missingAnchors`, which reads tripScope, while `sectionIsExpected` decided
 * the same question from tripTransport and had never heard of scope. The app
 * had stopped asking and was still showing.
 *
 * The repeat is the point of this file. Correcting the second copy would have
 * produced a third one, so what is pinned here is that there is only one —
 * both callers delegate, and neither re-derives the answer from a raw field.
 */

const ANCHORS = resolve(__dirname, '../services/planningAnchors.ts');
const SECTIONS = resolve(__dirname, '../services/tripSections.ts');

describe('whether a trip involves flying', () => {
  it('believes a flight that is already on the trip, over anything else', () => {
    // 松山→澎湖 is a domestic flight. The fact outranks the classification.
    expect(tripInvolvesFlying({
      tripScope: 'domestic',
      tripTransport: ['train'],
      flightAnchors: [{ departureDate: '2026-12-01' }],
    })).toBe(true);
  });

  it('believes what the traveller said, over the scope', () => {
    expect(tripInvolvesFlying({ tripScope: 'domestic', tripTransport: ['flight'] })).toBe(true);
    expect(tripInvolvesFlying({ tripScope: 'international', tripTransport: ['train'] })).toBe(false);
  });

  it('falls back to the scope only when nobody said', () => {
    expect(tripInvolvesFlying({ tripScope: 'domestic' })).toBe(false);
    expect(tripInvolvesFlying({ tripScope: 'domestic', tripTransport: [] })).toBe(false);
    expect(tripInvolvesFlying({ tripScope: 'international' })).toBe(true);
    // Unclassified is not domestic. Hiding on a guess is discovered at the airport.
    expect(tripInvolvesFlying({})).toBe(true);
  });

  it('ignores a flight with no date — it anchors nothing', () => {
    expect(tripInvolvesFlying({ tripScope: 'domestic', flightAnchors: [{}] })).toBe(false);
  });
});

describe('the two callers agree, on every combination', () => {
  const scopes = [undefined, 'domestic', 'international'] as const;
  const plans = [undefined, [], ['flight'], ['train'], ['train', 'flight']] as const;

  it('never shows the form for a trip it would not ask', () => {
    for (const tripScope of scopes) {
      for (const tripTransport of plans) {
        const asked = missingAnchors({ tripScope, tripTransport: tripTransport as never, flightAnchors: [], stays: [] })
          .includes('flights');
        const shown = sectionIsExpected('flights', tripTransport as never, { tripScope, flightAnchors: [] });
        expect(
          asked,
          `scope=${tripScope} plan=${JSON.stringify(tripTransport)}: ask and form disagreed`,
        ).toBe(shown);
      }
    }
  });

  it('shows the form for a trip that already has a flight, and stops asking', () => {
    const flightAnchors = [{ departureDate: '2026-12-01' } as FlightAnchor];
    expect(sectionIsExpected('flights', ['train'], { tripScope: 'domestic', flightAnchors })).toBe(true);
    // Already answered, so there is nothing left to ask for.
    expect(missingAnchors({ tripScope: 'domestic', tripTransport: ['train'], flightAnchors, stays: [] }))
      .not.toContain('flights');
  });
});

describe('one home', () => {
  /*
    Read as source, because a second copy is invisible from outside: it agrees
    with the first on every case anybody tested, right up to the field one of
    them does not read. That is exactly how this defect came back.
  */
  it('is not re-derived in either caller', () => {
    for (const path of [ANCHORS, SECTIONS]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('tripInvolvesFlying');
      expect(source, `${path} decides flying from tripScope itself`)
        .not.toMatch(/tripScope\s*[!=]==\s*'domestic'/);
    }
  });

  it('keeps the rental rule where it was — this ticket only moved flying', () => {
    expect(sectionIsExpected('rental', ['drive'])).toBe(true);
    expect(sectionIsExpected('rental', ['train'])).toBe(false);
    expect(sectionIsExpected('rental', undefined)).toBe(true);
    expect(sectionIsExpected('rental', [])).toBe(true);
  });
});
