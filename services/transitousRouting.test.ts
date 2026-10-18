/**
 * 「但能不能查大眾運輸的時間」.
 *
 * The payloads below are trimmed from the live service, asked on 2026-10-18
 * for 新宿 → 浅草 — the exact journey his Japan trip could never answer for.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchTransitousLeg, legFromItinerary, transitousEnabled } from './transitousRouting';

const SHINJUKU = { latitude: 35.6896, longitude: 139.7006 };
const ASAKUSA = { latitude: 35.7148, longitude: 139.7967 };

const itinerary = (durationSeconds: number, legs: unknown[]) => ({ duration: durationSeconds, legs });

const MEASURED = itinerary(2040, [
  { mode: 'WALK', duration: 120, from: { name: 'START' }, to: { name: '新宿 Shinjuku' } },
  { mode: 'REGIONAL_RAIL', duration: 540, routeShortName: 'JC', from: { name: '新宿 Shinjuku' }, to: { name: '御茶ノ水 Ochanomizu' } },
  { mode: 'REGIONAL_RAIL', duration: 360, routeShortName: 'TX', from: { name: '秋葉原' }, to: { name: '浅草 Asakusa' } },
]);

const respond = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

describe('legFromItinerary', () => {
  it('reads the ride, the line and the stops', () => {
    const leg = legFromItinerary(MEASURED);

    expect(leg?.durationSeconds).toBe(2040);
    expect(leg?.steps[1]).toMatchObject({
      travelMode: 'TRANSIT', lineName: 'JC', departureStop: '新宿 Shinjuku', arrivalStop: '御茶ノ水 Ochanomizu',
    });
  });

  /* MOTIS names the request's own endpoints; 「START」 is not a station. */
  it('does not print START as a stop', () => {
    expect(legFromItinerary(MEASURED)?.steps[0].departureStop).toBeUndefined();
  });

  /*
    Some feeds carry only an internal id — the live response for this very
    journey returned 「9459821」 as a line name, which is worse than a blank.
  */
  it('drops a line name that is only digits', () => {
    const leg = legFromItinerary(itinerary(600, [
      { mode: 'REGIONAL_RAIL', duration: 600, routeShortName: '9459821', from: { name: '御茶ノ水' }, to: { name: '秋葉原' } },
    ]));

    expect(leg?.steps[0].lineName).toBeUndefined();
  });

  it('refuses an itinerary with no duration', () => {
    expect(legFromItinerary({ legs: [] })).toBeUndefined();
  });
});

describe('fetchTransitousLeg', () => {
  /*
    The order MOTIS returns is a spread of departures, not a ranking. Taking
    the first would have printed 73 minutes beside a 34-minute alternative it
    found in the same response.
  */
  it('takes the quickest itinerary, not the first', async () => {
    const leg = await fetchTransitousLeg(SHINJUKU, ASAKUSA, undefined, {
      fetchImpl: respond({ itineraries: [itinerary(4380, []), MEASURED] }),
    });

    expect(leg?.durationSeconds).toBe(2040);
  });

  /* It is asked after a lookup already failed, on a service with no SLA. */
  it('answers nothing rather than throwing when the service is down', async () => {
    const leg = await fetchTransitousLeg(SHINJUKU, ASAKUSA, undefined, {
      fetchImpl: vi.fn(async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch,
    });

    expect(leg).toBeUndefined();
  });

  it('answers nothing when there is no itinerary', async () => {
    const leg = await fetchTransitousLeg(SHINJUKU, ASAKUSA, undefined, { fetchImpl: respond({ itineraries: [] }) });

    expect(leg).toBeUndefined();
  });

  it('asks for the hour the traveller sets off', async () => {
    const call = respond({ itineraries: [MEASURED] });
    await fetchTransitousLeg(SHINJUKU, ASAKUSA, '2026-10-20T10:00:00.000Z', { fetchImpl: call });

    const url = String((call as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain('fromPlace=35.6896%2C139.7006');
    expect(url).toContain('time=2026-10-20T10%3A00%3A00.000Z');
  });
});

/**
 * Off unless deliberately switched on. Their policy asks for open-source,
 * non-commercial consumers; whether Trippie qualifies is not a code decision.
 */
describe('the gate', () => {
  it('is closed by default', () => {
    expect(transitousEnabled({})).toBe(false);
    expect(transitousEnabled({ TRANSITOUS_ENABLED: 'false' })).toBe(false);
    expect(transitousEnabled({ TRANSITOUS_ENABLED: '1' })).toBe(false);
  });

  it('opens only on an explicit true', () => {
    expect(transitousEnabled({ TRANSITOUS_ENABLED: 'true' })).toBe(true);
  });
});

/* A generic agent is refused with a 403 — which is how this was found. */
describe('the contact header their policy requires', () => {
  it('identifies the app and how to reach it', async () => {
    const call = respond({ itineraries: [MEASURED] });
    await fetchTransitousLeg(SHINJUKU, ASAKUSA, undefined, { fetchImpl: call });

    const init = (call as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers['User-Agent']).toContain('Trippie/');
    expect(init.headers['User-Agent']).toContain('http');
  });
});
