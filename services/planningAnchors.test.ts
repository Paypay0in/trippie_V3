import { describe, expect, it } from 'vitest';
import { ANCHOR_LABEL, anchorsBrief, missingAnchors } from './planningAnchors';

/**
 * 「要他們先傳航班與住宿資訊 並提示：要先確定航班與住宿地點 才能相應依據這兩個點
 *   做規劃」.
 *
 * The planner proposed an overnight trip to 由布院 without noticing it meant
 * changing hotels, and read a 6-day trip as six usable days when the flight
 * landed in the evening. It was not ignoring either cost — it was never told
 * where the traveller sleeps or when they land.
 */

const flight = (over: Record<string, unknown> = {}) => ({
  id: 'f-1',
  direction: 'OUTBOUND',
  departureDate: '2026-11-05',
  departureTime: '14:20',
  departureAirport: '桃園國際機場',
  arrivalDate: '2026-11-05',
  arrivalTime: '18:40',
  arrivalAirport: '福岡機場',
  ...over,
}) as never;

const stay = (over: Record<string, unknown> = {}) => ({
  name: '博多站前飯店',
  address: '福岡市博多區博多站前 2-1-1',
  checkInDate: '2026-11-05',
  checkOutDate: '2026-11-10',
  nights: ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
  itemId: 'i-1',
  ...over,
}) as never;

describe('what a trip needs before anything can be planned around it', () => {
  it('names both when the trip has neither', () => {
    expect(missingAnchors({})).toEqual(['flights', 'stays']);
  });

  it('is satisfied once each is there', () => {
    expect(missingAnchors({ flightAnchors: [flight()], stays: [stay()] })).toEqual([]);
  });

  /**
   * A stay with a name and nothing else cannot group a day geographically,
   * which is the whole reason the planner is being given it.
   */
  it('does not accept a stay that cannot say where', () => {
    expect(missingAnchors({ flightAnchors: [flight()], stays: [stay({ address: undefined })] }))
      .toEqual(['stays']);
    // Coordinates are enough; an address is one of two ways to know where.
    expect(missingAnchors({
      flightAnchors: [flight()],
      stays: [stay({ address: undefined, latitude: 33.59, longitude: 130.4 })],
    })).toEqual([]);
  });

  /** A flight with no date says nothing about which hours are spent. */
  it('does not accept a flight with no date', () => {
    expect(missingAnchors({ flightAnchors: [flight({ departureDate: '' })], stays: [stay()] }))
      .toEqual(['flights']);
  });

  /**
   * Keys, not words: a module-scope `const` cannot call `t()`, so the card
   * resolves these. The copy itself lives in `plan.anchor.*`.
   */
  it('labels both the way the cards are named', () => {
    expect(ANCHOR_LABEL.flights).toBe('plan.anchor.flights');
    expect(ANCHOR_LABEL.stays).toBe('plan.anchor.stays');
  });
});

describe('the facts, as the planner reads them', () => {
  /**
   * The arrival hour is the fact that stops a six-day trip being planned as
   * six days. Said as an instruction, because the time alone is a number the
   * model can read past.
   */
  it('says the arrival day is half a day', () => {
    const text = anchorsBrief({ flightAnchors: [flight()], stays: [stay()] });
    expect(text).toContain('18:40');
    expect(text).toContain('抵達當天只剩下半天');
  });

  it('says what the return day costs', () => {
    const text = anchorsBrief({
      flightAnchors: [flight({ direction: 'RETURN', departureDate: '2026-11-10', departureTime: '09:15', departureAirport: '福岡機場' })],
      stays: [stay()],
    });
    expect(text).toContain('09:15');
    expect(text).toContain('不要安排整天的行程');
  });

  /**
   * The hotel's address, and the rule that follows from there being one of
   * them: every day has to come back here. This is the sentence that would
   * have stopped the 由布院 overnight being proposed without a word about
   * changing hotels.
   */
  it('gives the address and forbids a plan that moves base', () => {
    const text = anchorsBrief({ flightAnchors: [flight()], stays: [stay()] });
    expect(text).toContain('博多站前飯店');
    expect(text).toContain('博多區');
    expect(text).toContain('不要提出需要換住宿的方案');
  });

  it('counts the moves a trip already makes', () => {
    const text = anchorsBrief({
      flightAnchors: [flight()],
      stays: [stay(), stay({ name: '由布院旅館', address: '大分縣由布市', itemId: 'i-2' })],
    });
    expect(text).toContain('已經換 2 次住宿');
    expect(text).not.toContain('整趟住同一間');
  });

  /** Geography is the first thing a day is built from, so it is said once. */
  it('asks for a day to stay in one area', () => {
    expect(anchorsBrief({ flightAnchors: [flight()], stays: [stay()] }))
      .toContain('同一天的地點要在同一區');
  });

  /**
   * Empty rather than a polite filler: a sentence saying nothing still costs
   * the model attention, and the gate means this case should not reach the
   * planner anyway.
   */
  it('says nothing when there is nothing to say', () => {
    expect(anchorsBrief({})).toBe('');
  });
});
