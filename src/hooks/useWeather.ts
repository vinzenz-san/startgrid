import { useCallback, useEffect, useRef, useState } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { fetchCurrentWeather, type CurrentWeather } from '../lib/openMeteoApi';

const CACHE_TTL_MS = 15 * 60 * 1000; // weather changes faster than a daily image — short TTL

interface WeatherCache {
  weather: CurrentWeather;
  fetchedAt: number;
}

function cacheKey(lat: number, lon: number, units: string): string {
  return `sg:weather:cache:${lat.toFixed(2)}:${lon.toFixed(2)}:${units}`;
}

interface Params {
  latitude?: number;
  longitude?: number;
  units: 'metric' | 'imperial';
}

/**
 * Fetches current weather for a lat/lon, caching to `storage.local` with a
 * 15-minute TTL. On a failed refetch it falls back to the last cached value
 * (regardless of TTL) and flags `isStale` rather than surfacing a bare error.
 */
export function useWeather({ latitude, longitude, units }: Params) {
  const hasLocation = latitude !== undefined && longitude !== undefined;

  const [weather, setWeather]       = useState<CurrentWeather | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isStale, setIsStale]       = useState(false);

  const fetchRef = useRef<() => Promise<void>>(async () => {});

  // Bumped by every param change below, and by fetchWeather itself when it
  // starts — a resolved async call only applies its result if it's still the
  // most recent one requested, so switching location/units mid-flight can't
  // clobber the newer request's state with a stale one.
  const requestIdRef = useRef(0);

  const fetchWeather = useCallback(async () => {
    if (!hasLocation) return;
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetchCurrentWeather(latitude!, longitude!, units);
      if (requestIdRef.current !== requestId) return;
      setWeather(result);
      setIsStale(false);
      const cache: WeatherCache = { weather: result, fetchedAt: Date.now() };
      storageLocal.set(cacheKey(latitude!, longitude!, units), cache);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Fetch failed');
      // Fall back to the last cached value (regardless of its TTL) rather
      // than a bare error screen when one exists — a failed refresh is
      // usually a network blip, not a reason to hide data the widget
      // already had.
      const cached = await storageLocal.get(cacheKey(latitude!, longitude!, units));
      if (requestIdRef.current !== requestId) return;
      const c = cached as WeatherCache | undefined;
      if (c) { setWeather(c.weather); setIsStale(true); }
    } finally {
      if (requestIdRef.current === requestId) setIsFetching(false);
    }
  }, [hasLocation, latitude, longitude, units]);

  useEffect(() => { fetchRef.current = fetchWeather; }, [fetchWeather]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!hasLocation) { setWeather(null); setIsStale(false); return; }
    const key = cacheKey(latitude!, longitude!, units);
    storageLocal.get(key).then(cached => {
      if (requestIdRef.current !== requestId) return;
      const c = cached as WeatherCache | undefined;
      if (c && Date.now() - c.fetchedAt < CACHE_TTL_MS) {
        setWeather(c.weather);
        setIsStale(false);
      } else {
        fetchRef.current();
      }
    });
  }, [hasLocation, latitude, longitude, units]);

  return { weather, isFetching, error, isStale, refetch: fetchWeather };
}
