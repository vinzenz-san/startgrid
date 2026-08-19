import { useState, useEffect, useCallback, useRef } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { BackgroundConfig } from '../types/background';
import { fetchApodImage } from '../lib/astronomyApi';

interface ApodCache {
  url: string;
  title?: string;
  copyright?: string;
  fetchedDate: string; // YYYY-MM-DD — the APOD date this entry is for (today's or a custom pick)
}

const CACHE_KEY = 'sg:apod:cache';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resolves which APOD date is actually being requested — today's, unless the
// config explicitly opts into a custom date.
function resolveDateKey(config: BackgroundConfig): string {
  if (config.mode === 'astronomy' && config.dateMode === 'custom' && config.customDate) {
    return config.customDate;
  }
  return todayKey();
}

/**
 * Fetches and caches NASA's Astronomy Picture of the Day for the Background
 * widget's `astronomy` mode, keyed by date (today, or a custom pick). A
 * video-of-the-day response resolves to `null` and clears any stale cached
 * image, letting the provider fall back to its gradient.
 */
export function useAstronomy(
  config: BackgroundConfig,
  setImageUrl: (url: string | null) => void,
) {
  const isActive = config.mode === 'astronomy';
  const dateKey  = resolveDateKey(config);

  const [title, setTitle]           = useState<string | undefined>(undefined);
  const [copyright, setCopyright]   = useState<string | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Always-current ref, same pattern as useBing's fetchRef
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchImage = useCallback(async () => {
    const requestedDate = resolveDateKey(config);
    setIsFetching(true);
    setError(null);
    try {
      // 'today' mode passes no explicit date, so NASA always resolves to its
      // own current day rather than trusting the client clock.
      const isCustom = config.mode === 'astronomy' && config.dateMode === 'custom';
      const result = await fetchApodImage(isCustom ? requestedDate : undefined);
      if (!result) {
        // Requested APOD is a video, not an image — provider falls back to
        // its gradient; clear any stale cached image so it doesn't keep showing.
        setTitle(undefined);
        setCopyright(undefined);
        setImageUrl(null);
        storageLocal.remove(CACHE_KEY);
        return;
      }
      const { url, title: t, copyright: c } = result;
      setTitle(t);
      setCopyright(c);
      setImageUrl(url);
      const cache: ApodCache = { url, title: t, copyright: c, fetchedDate: requestedDate };
      storageLocal.set(CACHE_KEY, cache);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setIsFetching(false);
    }
  }, [config, setImageUrl]);

  useEffect(() => { fetchRef.current = fetchImage; }, [fetchImage]);

  // Load cache when mode becomes active, or when the chosen date changes —
  // reuse the cached image for that date if present, else refetch.
  useEffect(() => {
    if (!isActive) { setImageUrl(null); return; }
    storageLocal.get(CACHE_KEY).then(cached => {
      const cachedEntry = cached as ApodCache | undefined;
      if (cachedEntry && cachedEntry.fetchedDate === dateKey) {
        setTitle(cachedEntry.title);
        setCopyright(cachedEntry.copyright);
        setImageUrl(cachedEntry.url);
      } else {
        fetchRef.current();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, dateKey]);

  return {
    title,
    copyright,
    isFetching,
    error,
    fetchNow: fetchImage,
  };
}
