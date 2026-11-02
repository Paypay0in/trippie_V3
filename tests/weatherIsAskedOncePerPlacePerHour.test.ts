import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearTripWeatherCache, fetchTripWeather } from '../services/weatherService';

/**
 * Production said why the weather card was empty, in its own words:
 * `forecast 429 from api.open-meteo.com: "Daily API request limit exceeded."`
 *
 * The quota is counted against the server's address, not per traveller, so
 * every traveller shares one allowance and the repair is to ask less. Two
 * things were spending it:
 *
 *   1. `TripLiveOverview` hand-built `/api/weather?...` while the typed
 *      `fetchTripWeather` sat with zero callers — two homes, the dead one
 *      holding the types.
 *   2. That effect re-ran on the next stop, today's items and the destination
 *      text, so opening one trip asked several times.
 *
 * Asserted here: one request per identical place, repeats inside the hour
 * served from memory, concurrent callers collapsed into one, and a FAILURE
 * never cached — the quota resets at midnight and so must the asking.
 */

const snapshot = { temperature: 21, condition: '多雲', high: 24, low: 18, precipitationProbability: 10 };

const okFetch = () => vi.fn(async () => ({ ok: true, json: async () => snapshot })) as never;

beforeEach(() => { clearTripWeatherCache(); });
afterEach(() => { vi.restoreAllMocks(); clearTripWeatherCache(); });

describe('asking for the weather', () => {
  it('asks once for the same place and serves the repeat from memory', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchTripWeather('新莊', { latitude: 25.0266, longitude: 121.4178 }, '台灣');
    const second = await fetchTripWeather('新莊', { latitude: 25.0266, longitude: 121.4178 }, '台灣');

    expect(first).toEqual(snapshot);
    expect(second).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /* The render that fires twice before the first answer lands. */
  it('collapses concurrent callers into one request', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      fetchTripWeather('東京', { latitude: 35.68, longitude: 139.76 }),
      fetchTripWeather('東京', { latitude: 35.68, longitude: 139.76 }),
      fetchTripWeather('東京', { latitude: 35.68, longitude: 139.76 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still asks for a different place', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await fetchTripWeather('新莊', { latitude: 25.0266, longitude: 121.4178 });
    await fetchTripWeather('台南', { latitude: 22.99, longitude: 120.21 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /*
    A 429 is not an answer to remember. Caching it would keep the card empty
    after the quota reset, which is the failure mode that hides a fix.
  */
  it('does not remember a failure', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'nope' }) }));
    vi.stubGlobal('fetch', fetchMock as never);

    await expect(fetchTripWeather('新莊', { latitude: 25.0266, longitude: 121.4178 })).rejects.toThrow();
    await expect(fetchTripWeather('新莊', { latitude: 25.0266, longitude: 121.4178 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('where the request is built', () => {
  /*
    One home. Read from source because the pairing lives there: a component
    that builds the query itself bypasses the cache entirely, and the card
    would look identical while spending the quota again.
  */
  it('is the service, not the screen', () => {
    const screen = readFileSync(resolve(__dirname, '../components/TripLiveOverview.tsx'), 'utf8');

    expect(screen).toContain('fetchTripWeather');
    /*
      Matched on the call, not on the string. The first version forbade the
      path anywhere in the file and failed on the comment that explains why
      the path left — a guard that cannot tell an explanation from a request
      teaches the next person to delete the explanation.
    */
    expect(screen).not.toMatch(/fetch\(\s*[`'"]\/api\/weather/);
    expect(screen).not.toMatch(/weatherParams/);
  });

  /* And the server caches too, because the quota is spent by the server. */
  it('is cached on the server, where the quota is counted', () => {
    const server = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

    expect(server).toContain('weatherCache');
    expect(server).toContain('WEATHER_TTL_MS');
  });
});
