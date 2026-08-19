import { useState, useEffect, useCallback, useRef } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { BackgroundConfig } from '../types/background';
import { fetchBingImage } from '../lib/backgroundProviders/bing';

interface BingCache {
  url: string;
  title?: string;
  fetchedDate: string; // YYYY-MM-DD — the Bing date this entry is for (today's or a custom pick)
}

const CACHE_KEY = 'sg:bing:cache';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resolves which Bing wallpaper date is actually being requested — today's,
// unless the config explicitly opts into a custom date. Same pattern as
// useAstronomy's resolveDateKey.
function resolveDateKey(config: BackgroundConfig): string {
  if (config.mode === 'bing' && config.dateMode === 'custom' && config.customDate) {
    return config.customDate;
  }
  return todayKey();
}

/**
 * Fetches and caches the Bing wallpaper of the day for the Background
 * widget's `bing` mode, keyed by date (today, or a custom pick). Falls back
 * to the last cached wallpaper (any date, flagging `isStale`) if a refetch fails.
 */
export function useBing(
  config: BackgroundConfig,
  setImageUrl: (url: string | null) => void,
) {
  const isActive = config.mode === 'bing';
  const dateKey  = resolveDateKey(config);

  const [title, setTitle]           = useState<string | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isStale, setIsStale]       = useState(false);

  // Always-current ref, same pattern as useAstronomy's fetchRef
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchImage = useCallback(async () => {
    const requestedDate = resolveDateKey(config);
    setIsFetching(true);
    setError(null);
    try {
      // 'today' mode passes no explicit date, so the mirror always resolves
      // to its own latest entry rather than trusting the client clock.
      const isCustom = config.mode === 'bing' && config.dateMode === 'custom';
      const { url, title: t } = await fetchBingImage(isCustom ? requestedDate : undefined);
      setTitle(t);
      setImageUrl(url);
      setIsStale(false);
      const cache: BingCache = { url, title: t, fetchedDate: requestedDate };
      storageLocal.set(CACHE_KEY, cache);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
      // Re-apply the last cached wallpaper (any date) rather than leaving
      // nothing on screen — same reasoning as useWeather.ts's fallback.
      const cached = await storageLocal.get(CACHE_KEY);
      const c = cached as BingCache | undefined;
      if (c) {
        setTitle(c.title);
        setImageUrl(c.url);
        setIsStale(true);
      }
    } finally {
      setIsFetching(false);
    }
  }, [config, setImageUrl]);

  useEffect(() => { fetchRef.current = fetchImage; }, [fetchImage]);

  // Load cache when mode becomes active, or when the chosen date changes —
  // reuse the cached image for that date if present, else refetch.
  useEffect(() => {
    if (!isActive) { setImageUrl(null); setIsStale(false); return; }
    storageLocal.get(CACHE_KEY).then(cached => {
      const c = cached as BingCache | undefined;
      if (c && c.fetchedDate === dateKey) {
        setTitle(c.title);
        setImageUrl(c.url);
        setIsStale(false);
      } else {
        fetchRef.current();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, dateKey]);

  return {
    title,
    isFetching,
    error,
    isStale,
    fetchNow: fetchImage,
  };
}
