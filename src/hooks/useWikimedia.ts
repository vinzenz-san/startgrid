import { useState, useEffect, useCallback, useRef } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { BackgroundConfig } from '../types/background';
import { fetchWikimediaImage } from '../lib/wikimediaApi';

interface WikimediaCache {
  url: string;
  title?: string;
  artist?: string;
  fetchedDate: string; // YYYY-MM-DD — the feed date this entry is for (today's or a custom pick)
}

const CACHE_KEY = 'sg:wikimedia:cache';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveDateKey(config: BackgroundConfig): string {
  if (config.mode === 'wikimedia' && config.dateMode === 'custom' && config.customDate) {
    return config.customDate;
  }
  return todayKey();
}

/**
 * Fetches and caches the Wikimedia "Picture of the Day" for the Background
 * widget's `wikimedia` mode, keyed by date (today, or a custom pick) so
 * switching back to an already-seen date reuses the cache instead of refetching.
 */
export function useWikimedia(
  config: BackgroundConfig,
  setImageUrl: (url: string | null) => void,
) {
  const isActive = config.mode === 'wikimedia';
  const dateKey  = resolveDateKey(config);

  const [title, setTitle]           = useState<string | undefined>(undefined);
  const [artist, setArtist]         = useState<string | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchImage = useCallback(async () => {
    const requestedDate = resolveDateKey(config);
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetchWikimediaImage(requestedDate);
      const { url, title: t, artist: a } = result;
      setTitle(t);
      setArtist(a);
      setImageUrl(url);
      const cache: WikimediaCache = { url, title: t, artist: a, fetchedDate: requestedDate };
      storageLocal.set(CACHE_KEY, cache);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setIsFetching(false);
    }
  }, [config, setImageUrl]);

  useEffect(() => { fetchRef.current = fetchImage; }, [fetchImage]);

  useEffect(() => {
    if (!isActive) { setImageUrl(null); return; }
    storageLocal.get(CACHE_KEY).then(cached => {
      const cachedEntry = cached as WikimediaCache | undefined;
      if (cachedEntry && cachedEntry.fetchedDate === dateKey) {
        setTitle(cachedEntry.title);
        setArtist(cachedEntry.artist);
        setImageUrl(cachedEntry.url);
      } else {
        fetchRef.current();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, dateKey]);

  return {
    title,
    artist,
    isFetching,
    error,
    fetchNow: fetchImage,
  };
}
