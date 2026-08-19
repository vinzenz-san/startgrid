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

function isGeocodeApiEntry(v: unknown): v is GeocodeApiEntry {
  if (v === null || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.name === 'string' && typeof e.latitude === 'number'
    && typeof e.longitude === 'number' && typeof e.timezone === 'string';
}

/** Looks up up to 5 candidate locations for a city-name query via Open-Meteo's geocoding API. */
export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const url = `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(query)}&count=5&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const raw = await res.json() as { results?: unknown };
  const data = { results: Array.isArray(raw.results) ? raw.results.filter(isGeocodeApiEntry) : [] };
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

function isForecastApiResponse(v: unknown): v is ForecastApiResponse {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (r.current === undefined) return true; // caller handles "no current" itself
  if (r.current === null || typeof r.current !== 'object') return false;
  const c = r.current as Record<string, unknown>;
  return typeof c.temperature_2m === 'number' && typeof c.apparent_temperature === 'number'
    && typeof c.weather_code === 'number' && typeof c.wind_speed_10m === 'number'
    && typeof c.is_day === 'number';
}

/** Fetches current conditions for a lat/lon; throws on a non-OK response or an unexpected response shape. */
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
  const data = await res.json() as unknown;
  if (!isForecastApiResponse(data)) throw new Error('Malformed Open-Meteo forecast response');
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

function isDailyForecastApiResponse(v: unknown): v is DailyForecastApiResponse {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (r.daily === undefined) return true; // caller handles "no daily" itself
  if (r.daily === null || typeof r.daily !== 'object') return false;
  const d = r.daily as Record<string, unknown>;
  return Array.isArray(d.time) && Array.isArray(d.weather_code)
    && Array.isArray(d.temperature_2m_max) && Array.isArray(d.temperature_2m_min);
}

/** Fetches a multi-day daily forecast for a lat/lon; throws on a non-OK response or an unexpected response shape. */
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
  const data = await res.json() as unknown;
  if (!isDailyForecastApiResponse(data)) throw new Error('Malformed Open-Meteo daily forecast response');
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
