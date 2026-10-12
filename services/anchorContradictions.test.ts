import { describe, expect, it } from 'vitest';
import { anchorContradictions, anchorsAreTrustworthy, contradictionHeadline } from './anchorContradictions';

/**
 * 「有一個問題點：我的標題是沖繩」.
 *
 * A trip to 日本沖繩, 2026/11/05–11/10, carrying a ticket TPE→NRT on 10/20 and
 * NRT→TPE on 10/24. The destination was wrong and the dates were wrong, both
 * facts were on the same card, and nothing read them together.
 *
 * The existing flight validation only asks whether a field is empty. A filled
 * field that contradicts the trip passed it without a word — and now that the
 * planner is fed these as fact, that silence reaches the model as 「抵達：
 * 2026-10-20 到 成田國際機場」 for a November trip to Okinawa.
 */

const anchor = (over: Record<string, unknown> = {}) => ({
  id: 'f-out',
  direction: 'OUTBOUND',
  departureDate: '2026-11-05',
  departureTime: '08:00',
  departureAirport: 'TPE · Taiwan Taoyuan International Airport',
  arrivalAirport: 'OKA · Naha Airport',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
  ...over,
}) as never;

const trip = {
  destination: '日本沖繩',
  tripStartDate: '2026-11-05',
  tripEndDate: '2026-11-10',
};

describe('the trip the Founder was actually looking at', () => {
  it('catches both the date and the airport', () => {
    const found = anchorContradictions({
      ...trip,
      anchors: [
        anchor({
          departureDate: '2026-10-20',
          arrivalAirport: 'NRT · Narita International Airport',
        }),
        anchor({
          id: 'f-ret',
          direction: 'RETURN',
          departureDate: '2026-10-24',
          departureAirport: 'NRT · Narita International Airport',
          arrivalAirport: 'TPE · Taiwan Taoyuan International Airport',
        }),
      ],
    });

    expect(found.map(item => item.kind).sort()).toEqual(['airport', 'airport', 'date', 'date']);
    expect(found.some(item => item.message.includes('2026-10-20'))).toBe(true);
    expect(found.some(item => item.message.includes('Narita'))).toBe(true);
  });

  it('is quiet about a trip whose flights agree with it', () => {
    expect(anchorContradictions({ ...trip, anchors: [anchor()] })).toEqual([]);
    expect(anchorsAreTrustworthy({ ...trip, anchors: [anchor()] })).toBe(true);
  });
});

describe('the dates', () => {
  it('names the leg and both ranges', () => {
    const [found] = anchorContradictions({
      ...trip,
      anchors: [anchor({ departureDate: '2026-12-01' })],
    });

    expect(found?.message).toContain('去程');
    expect(found?.message).toContain('2026-12-01');
    expect(found?.message).toContain('2026-11-05');
  });

  /** Both ends of the trip count; the last day is still inside it. */
  it('accepts a flight on the final day', () => {
    expect(anchorContradictions({ ...trip, anchors: [anchor({ departureDate: '2026-11-10' })] }))
      .toEqual([]);
  });

  /** Nothing to compare against is not a contradiction. */
  it('says nothing when the trip has no dates', () => {
    expect(anchorContradictions({
      destination: '日本沖繩',
      anchors: [anchor({ departureDate: '2026-10-20' })],
    }).filter(item => item.kind === 'date')).toEqual([]);
  });
});

describe('the airport', () => {
  /**
   * The outbound is judged on where it lands and the return on where it
   * leaves from — the two moments the traveller is actually at the
   * destination. Judging both on departure would flag every outbound, which
   * leaves from home by definition.
   */
  it('reads the arrival on the way out and the departure on the way back', () => {
    expect(anchorContradictions({ ...trip, anchors: [anchor()] })).toEqual([]);

    const [found] = anchorContradictions({
      ...trip,
      anchors: [anchor({
        id: 'f-ret',
        direction: 'RETURN',
        departureAirport: 'NRT · Narita International Airport',
        arrivalAirport: 'TPE · Taiwan Taoyuan International Airport',
      })],
    });
    expect(found?.kind).toBe('airport');
    expect(found?.message).toContain('回程');
  });

  /**
   * The directory is hand-maintained, so silence is the honest answer for a
   * city nobody has entered. Claiming a mismatch from an empty table would
   * put a warning on every trip to somewhere small.
   */
  it('claims nothing about a destination it does not know', () => {
    expect(anchorContradictions({
      destination: '石垣島',
      tripStartDate: '2026-11-05',
      tripEndDate: '2026-11-10',
      anchors: [anchor({ arrivalAirport: 'ISG · New Ishigaki Airport' })],
    })).toEqual([]);
  });

  it('accepts the destination written in Chinese', () => {
    expect(anchorContradictions({
      destination: '沖繩',
      tripStartDate: '2026-11-05',
      tripEndDate: '2026-11-10',
      anchors: [anchor()],
    })).toEqual([]);
  });
});

/**
 * 「這張票是成田，但旅程是沖繩，確定嗎？」 — the Founder's own wording.
 *
 * Better than the heading it replaced. 「航班跟這趟旅程對不起來」 states a
 * verdict and then makes the reader assemble the two facts from a list; this
 * puts them side by side, which is the comparison being asked about.
 */
describe('the question, in one sentence', () => {
  const headlineFor = (input: Parameters<typeof contradictionHeadline>[1]) =>
    contradictionHeadline(anchorContradictions(input), input);

  it('puts the ticket and the trip next to each other', () => {
    const text = headlineFor({
      ...trip,
      anchors: [anchor({
        departureDate: '2026-10-20',
        arrivalAirport: 'NRT · Narita International Airport',
      })],
    });

    expect(text).toContain('2026-10-20');
    expect(text).toContain('Narita International Airport');
    expect(text).toContain('日本沖繩');
    expect(text).toContain('2026-11-05 – 2026-11-10');
    expect(text.endsWith('確定嗎？')).toBe(true);
    // The IATA prefix is dropped; the name is what a traveller reads.
    expect(text).not.toContain('NRT ·');
  });

  it('says only the half that disagrees', () => {
    const dateOnly = headlineFor({ ...trip, anchors: [anchor({ departureDate: '2026-10-20' })] });
    expect(dateOnly).toContain('2026-10-20');
    expect(dateOnly).not.toContain('日本沖繩');

    const airportOnly = headlineFor({
      ...trip,
      anchors: [anchor({ arrivalAirport: 'NRT · Narita International Airport' })],
    });
    expect(airportOnly).toContain('日本沖繩');
    expect(airportOnly).not.toContain('2026-11-05');
  });

  it('says nothing when nothing disagrees', () => {
    expect(headlineFor({ ...trip, anchors: [anchor()] })).toBe('');
  });
});
