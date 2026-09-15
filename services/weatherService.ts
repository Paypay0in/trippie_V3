export type WeatherSnapshot = {
  temperature: number;
  condition: string;
  high: number;
  low: number;
  precipitationProbability: number;
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
