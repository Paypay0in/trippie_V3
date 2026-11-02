export type WeatherSnapshot = {
  temperature: number;
  condition: string;
  high: number;
  low: number;
  precipitationProbability: number;
  /**
   * Tomorrow, when the provider returned a second day.
   *
   * 「少一個明天衣著建議！」 — what to wear is a question about tomorrow
   * morning asked tonight, and today's numbers cannot answer it. Absent
   * rather than guessed: see the endpoint.
   */
  tomorrow?: {
    high: number;
    low: number;
    precipitationProbability: number;
    condition?: string;
  };
};

/*
  The one place that asks for weather.

  This function had ZERO callers: `TripLiveOverview` hand-built the same query
  string beside it, so the typed home was the dead one. Two homes for one
  request is also how the asking went uncounted — the effect that built the URL
  re-ran on the next stop, today's items and the destination text, so opening
  one trip asked several times.

  That matters more than tidiness now. Production returned `forecast 429 ...
  "Daily API request limit exceeded"`, counted against the server's address.
  The server caches for an hour (see `server.ts`); this side stops the same
  render asking twice while the first answer is still in flight.
*/
const cache = new Map<string, { at: number; snapshot: WeatherSnapshot }>();
const pending = new Map<string, Promise<WeatherSnapshot>>();

/** Matches the server's window, for the same reason: hourly model, hourly answer. */
const TTL_MS = 60 * 60 * 1000;

/** For tests: the cache outlives one case, because the module does. */
export const clearTripWeatherCache = () => { cache.clear(); pending.clear(); };

export const fetchTripWeather = (destination: string, coordinates?: { latitude: number; longitude: number }, country?: string): Promise<WeatherSnapshot> => {
  const params = new URLSearchParams();
  if (coordinates) { params.set('latitude', String(coordinates.latitude)); params.set('longitude', String(coordinates.longitude)); }
  if (destination) params.set('destination', destination);
  if (country) params.set('country', country);
  const query = params.toString();

  const cached = cache.get(query);
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.snapshot);
  const inFlight = pending.get(query);
  if (inFlight) return inFlight;

  const request = fetch(`/api/weather?${query}`)
    .then(async response => {
      if (!response.ok) throw new Error('Weather request failed');
      return await response.json() as WeatherSnapshot;
    })
    .then(snapshot => { cache.set(query, { at: Date.now(), snapshot }); return snapshot; })
    /* A failure is not cached: the quota resets, and so should the asking. */
    .finally(() => { pending.delete(query); });

  pending.set(query, request);
  return request;
};
