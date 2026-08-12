// Pure network helper — fetches from Open-Meteo (api.open-meteo.com /
// geocoding-api.open-meteo.com), a free, no-API-key weather + geocoding
// service. Both endpoints send a permissive CORS header, so a direct fetch()
// from an extension page works with no background-script relay, same as the
// Bing mirror (see src/lib/bingApi.ts).

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export interface GeocodeResult {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface GeocodeApiEntry {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const url = `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(query)}&count=5&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as { results?: GeocodeApiEntry[] };
  return (data.results ?? []).map(r => ({
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  }));
}

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  windSpeed: number;
  isDay: boolean;
}

interface ForecastApiResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  units: 'metric' | 'imperial',
): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units === 'imperial' ? 'mph' : 'kmh',
  });
  const res = await fetch(`${FORECAST_ENDPOINT}?${params.toString()}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as ForecastApiResponse;
  const c = data.current;
  if (!c) throw new Error('No current weather in response');
  return {
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    weatherCode: c.weather_code,
    windSpeed: c.wind_speed_10m,
    isDay: c.is_day === 1,
  };
}

export interface DailyForecastDay {
  date: string; // ISO date, YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability?: number; // 0-100, % — omitted if the API doesn't return it for this day
}

interface DailyForecastApiResponse {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
}

export async function fetchDailyForecast(
  lat: number,
  lon: number,
  units: 'metric' | 'imperial',
  days: number,
): Promise<DailyForecastDay[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    forecast_days: String(days),
  });
  const res = await fetch(`${FORECAST_ENDPOINT}?${params.toString()}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as DailyForecastApiResponse;
  const d = data.daily;
  if (!d) throw new Error('No daily forecast in response');
  return d.time.map((date, i) => ({
    date,
    weatherCode: d.weather_code[i],
    tempMax: d.temperature_2m_max[i],
    tempMin: d.temperature_2m_min[i],
    precipitationProbability: d.precipitation_probability_max?.[i],
  }));
}
