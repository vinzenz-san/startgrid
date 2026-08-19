import { useCallback, useEffect, useRef, useState } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { fetchExchangeRates } from '../lib/exchangeRatesApi';

const DEFAULT_TTL_MIN = 60; // exchange rates update once daily upstream — a long TTL is fine

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

function cacheKey(base: string, targets: string[]): string {
  return `sg:fx:cache:${base}:${[...targets].sort().join(',')}`;
}

interface Params {
  baseCurrency?: string;
  targetCurrencies?: string[];
  refreshIntervalMin?: number;
}

/**
 * Fetches exchange rates for a base currency against a set of target
 * currencies, caching to `storage.local` (TTL defaults to 60 minutes since
 * upstream rates only update once daily). Falls back to the last cached
 * rates on a failed refetch, flagging `isStale` instead of erroring out.
 */
export function useCurrencyTicker({ baseCurrency, targetCurrencies, refreshIntervalMin }: Params) {
  const base = baseCurrency ?? 'EUR';
  const targets = targetCurrencies ?? [];
  const hasTargets = targets.length > 0;
  const ttlMs = (refreshIntervalMin ?? DEFAULT_TTL_MIN) * 60 * 1000;
  const targetsKey = [...targets].sort().join(',');

  const [rates, setRates]           = useState<Record<string, number>>({});
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isStale, setIsStale]       = useState(false);

  const fetchRef = useRef<() => Promise<void>>(async () => {});
  const requestIdRef = useRef(0);

  const fetchRates = useCallback(async () => {
    if (!hasTargets) return;
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetchExchangeRates(base, targets);
      if (requestIdRef.current !== requestId) return;
      setRates(result);
      setIsStale(false);
      const cache: RatesCache = { rates: result, fetchedAt: Date.now() };
      storageLocal.set(cacheKey(base, targets), cache);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Fetch failed');
      // Fall back to the last cached rates rather than a bare error when one
      // exists — same reasoning as useWeather.ts/useRssFeed.ts.
      const cached = await storageLocal.get(cacheKey(base, targets));
      if (requestIdRef.current !== requestId) return;
      const c = cached as RatesCache | undefined;
      if (c) { setRates(c.rates); setIsStale(true); }
    } finally {
      if (requestIdRef.current === requestId) setIsFetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTargets, base, targetsKey]);

  useEffect(() => { fetchRef.current = fetchRates; }, [fetchRates]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!hasTargets) { setRates({}); setIsStale(false); return; }
    const key = cacheKey(base, targets);
    storageLocal.get(key).then(cached => {
      if (requestIdRef.current !== requestId) return;
      const c = cached as RatesCache | undefined;
      if (c && Date.now() - c.fetchedAt < ttlMs) {
        setRates(c.rates);
        setIsStale(false);
      } else {
        fetchRef.current();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTargets, base, targetsKey, ttlMs]);

  return { rates, isFetching, error, isStale, refetch: fetchRates };
}
