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

export const fetchTripWeather = async (destination: string, coordinates?: { latitude: number; longitude: number }, country?: string): Promise<WeatherSnapshot> => {
  const params = new URLSearchParams();
  if (coordinates) { params.set('latitude', String(coordinates.latitude)); params.set('longitude', String(coordinates.longitude)); }
  if (destination) params.set('destination', destination);
  if (country) params.set('country', country);
  const response = await fetch(`/api/weather?${params.toString()}`);
  if (!response.ok) throw new Error('Weather request failed');
  return await response.json() as WeatherSnapshot;
};
