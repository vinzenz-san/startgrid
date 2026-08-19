import { useCallback, useEffect, useRef, useState } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { fetchDailyForecast, type DailyForecastDay } from '../lib/openMeteoApi';

const CACHE_TTL_MS = 60 * 60 * 1000; // daily forecast changes far slower than current conditions

interface ForecastCache {
  days: DailyForecastDay[];
  fetchedAt: number;
}

function cacheKey(lat: number, lon: number, units: string, days: number): string {
  return `sg:weather:forecast:${lat.toFixed(2)}:${lon.toFixed(2)}:${units}:${days}`;
}

interface Params {
  latitude?: number;
  longitude?: number;
  units: 'metric' | 'imperial';
  days: number;
  /** Only fetches when true — lets Weather.tsx skip the request entirely
   *  when the forecast row is toggled off. */
  enabled: boolean;
}

/**
 * Fetches a multi-day daily forecast for a lat/lon, caching to
 * `storage.local` with a 1-hour TTL (forecasts change far slower than
 * current conditions). No-ops entirely while `enabled` is false.
 */
export function useWeatherForecast({ latitude, longitude, units, days, enabled }: Params) {
  const hasLocation = latitude !== undefined && longitude !== undefined;

  const [forecast, setForecast]     = useState<DailyForecastDay[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fetchRef = useRef<() => Promise<void>>(async () => {});
  const requestIdRef = useRef(0);

  const fetchForecast = useCallback(async () => {
    if (!hasLocation || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetchDailyForecast(latitude!, longitude!, units, days);
      if (requestIdRef.current !== requestId) return;
      setForecast(result);
      const cache: ForecastCache = { days: result, fetchedAt: Date.now() };
      storageLocal.set(cacheKey(latitude!, longitude!, units, days), cache);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Fetch failed');
      const cached = await storageLocal.get(cacheKey(latitude!, longitude!, units, days));
      if (requestIdRef.current !== requestId) return;
      const c = cached as ForecastCache | undefined;
      if (c) setForecast(c.days);
    } finally {
      if (requestIdRef.current === requestId) setIsFetching(false);
    }
  }, [hasLocation, enabled, latitude, longitude, units, days]);

  useEffect(() => { fetchRef.current = fetchForecast; }, [fetchForecast]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!hasLocation || !enabled) { setForecast(null); return; }
    const key = cacheKey(latitude!, longitude!, units, days);
    storageLocal.get(key).then(cached => {
      if (requestIdRef.current !== requestId) return;
      const c = cached as ForecastCache | undefined;
      if (c && Date.now() - c.fetchedAt < CACHE_TTL_MS) {
        setForecast(c.days);
      } else {
        fetchRef.current();
      }
    });
  }, [hasLocation, enabled, latitude, longitude, units, days]);

  return { forecast, isFetching, error };
}
