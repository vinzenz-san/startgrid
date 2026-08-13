import { useState, useEffect, useCallback, useRef } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { MEDIA_PROXY_URL, MEDIA_PROXY_CONFIGURED } from '../lib/mediaProxy';
import { BackgroundConfig, UnsplashConfig } from '../types/background';

export interface UnsplashAttribution {
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoUrl: string;
  fetchedAt: number;
}

const CACHE_KEY = 'sg:unsplash:cache';

// Debounce for search-driven refetches (typing in Search/Collection ID) —
// keeps every keystroke from firing its own API call and hitting Unsplash's
// rate limit. Mode activation, manual "Next photo", and rotation stay instant.
const SEARCH_DEBOUNCE_MS = 450;

// Accepts either a bare collection id/slug or a full Unsplash collection URL
// (e.g. https://unsplash.com/de/kollektionen/3jMstqgu2e4/summer-light) and
// returns just the id/slug segment, trimmed of whitespace.
export function extractCollectionId(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/(?:collections|kollektionen)\/([a-zA-Z0-9_-]+)/i);
  return (match ? match[1] : trimmed).trim();
}

// All Unsplash requests go through this Cloudflare Worker (shared with
// astronomy.ts's NASA calls — see worker/api-proxy.ts), which attaches the
// real Access Key server-side — the key never ships in the extension bundle.
const PROXY_URL = MEDIA_PROXY_URL;
const UNSPLASH_API_ORIGIN = 'https://api.unsplash.com';

export function useUnsplash(
  config: BackgroundConfig,
  setImageUrl: (url: string | null) => void,
) {
  const isActive = config.mode === 'unsplash';
  const uc = isActive ? (config as UnsplashConfig) : undefined;
  const proxyReady = MEDIA_PROXY_CONFIGURED;

  const [attribution, setAttribution] = useState<UnsplashAttribution | null>(null);
  const [isFetching, setIsFetching]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [isStale, setIsStale]         = useState(false);

  // Always-current ref so rotation timer doesn't depend on fetchImage identity
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchImage = useCallback(async () => {
    // Every caller already gates on isActive/proxyReady before triggering a
    // fetch, but `uc` is a separately-captured closure variable that TS can't
    // narrow across that boundary — this guard makes the same guarantee
    // explicit (and type-checkable) at the one place that actually reads it.
    if (!proxyReady || !uc) return;
    setIsFetching(true);
    setError(null);
    try {
      const throwForStatus = (res: Response) => {
        if (res.ok) return;
        throw new Error(
          res.status === 401 ? 'Invalid API key'      :
          res.status === 403 ? 'Rate limit exceeded'  :
          res.status === 404 ? 'Collection not found' :
          `Error ${res.status}`,
        );
      };

      const source = uc.source ?? 'official';
      let data: {
        urls: { regular: string };
        user: { name: string; links: { html: string } };
        links: { html: string; download_location?: string };
      };

      if (source === 'collection' && uc.collectionId) {
        const collectionId = extractCollectionId(uc.collectionId);
        if (/^\d+$/.test(collectionId)) {
          // Legacy numeric collection ids still resolve via /photos/random.
          const params = new URLSearchParams({ orientation: 'landscape', collections: collectionId });
          const res = await fetch(`${PROXY_URL}/photos/random?${params}`);
          throwForStatus(res);
          data = await res.json();
        } else {
          // Modern alphanumeric collection slugs 404 on /photos/random?collections= —
          // pull a page from the collection's own photo list (an array of Photo, not
          // a single Photo like /photos/random) and pick one at random instead.
          const fetchCollectionPhotos = async (withOrientation: boolean) => {
            const params = new URLSearchParams({ per_page: '30' });
            if (withOrientation) params.set('orientation', 'landscape');
            const res = await fetch(
              `${PROXY_URL}/collections/${encodeURIComponent(collectionId)}/photos?${params}`,
            );
            throwForStatus(res);
            return res.json();
          };

          let photos = await fetchCollectionPhotos(true);
          if (!Array.isArray(photos) || photos.length === 0) {
            console.error(`[Unsplash] Collection "${collectionId}" returned no landscape-oriented photos — retrying without the orientation filter.`);
            photos = await fetchCollectionPhotos(false);
          }
          if (!Array.isArray(photos) || photos.length === 0) {
            console.error(`[Unsplash] Collection "${collectionId}" has no usable photos.`);
            throw new Error('Collection has no photos');
          }
          data = photos[Math.floor(Math.random() * photos.length)];
        }
      } else {
        const params = new URLSearchParams({ orientation: 'landscape' });
        if (source === 'search' && uc.query) {
          params.set('query', uc.query);
        } else if (source === 'topics' && uc.topics?.length) {
          params.set('topics', uc.topics.join(','));
        } else if (source === 'official') {
          params.set('featured', 'true');
        }
        const res = await fetch(`${PROXY_URL}/photos/random?${params}`);
        throwForStatus(res);
        data = await res.json();
      }

      const imageUrl = `${data.urls.regular}&w=1920&fm=webp&fit=max`;
      const next: UnsplashAttribution = {
        imageUrl,
        photographerName: data.user.name as string,
        photographerUrl:  `${data.user.links.html}?utm_source=startgrid&utm_medium=referral`,
        photoUrl:         `${data.links.html}?utm_source=startgrid&utm_medium=referral`,
        fetchedAt: Date.now(),
      };
      setAttribution(next);
      setImageUrl(next.imageUrl);
      setIsStale(false);
      storageLocal.set(CACHE_KEY, next);

      // Unsplash requires a download_location ping whenever a photo is
      // actually put to use, so photographer download counts stay accurate.
      // Fire-and-forget through the proxy — never blocks the UI.
      if (data.links.download_location) {
        const downloadUrl = data.links.download_location.replace(UNSPLASH_API_ORIGIN, PROXY_URL);
        fetch(downloadUrl).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
      // Re-apply the last cached photo rather than leaving whatever was on
      // screen (or nothing, on a first-load failure) — same reasoning as
      // useWeather.ts's fallback.
      const cached = await storageLocal.get(CACHE_KEY);
      const c = cached as UnsplashAttribution | undefined;
      if (c) {
        setAttribution(c);
        setImageUrl(c.imageUrl);
        setIsStale(true);
      }
    } finally {
      setIsFetching(false);
    }
  }, [proxyReady, uc, setImageUrl]);

  // Keep ref current
  useEffect(() => { fetchRef.current = fetchImage; }, [fetchImage]);

  // Load cache when mode becomes active
  useEffect(() => {
    if (!isActive) { setImageUrl(null); setIsStale(false); return; }
    storageLocal.get(CACHE_KEY).then(cached => {
      if (cached) {
        const c = cached as UnsplashAttribution;
        setAttribution(c);
        setImageUrl(c.imageUrl);
        setIsStale(false);
      }
      // 'every new tab' mode always fetches a fresh photo on load rather than
      // trusting the cache, even if a cached attribution already exists.
      if (proxyReady && (!cached || uc?.rotationInterval === 0)) {
        fetchRef.current();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Refetch when search config changes (not on mount — cache load handles that).
  // Debounced so typing into Search/Collection ID doesn't fire a request per
  // keystroke — each dependency change cancels the previous pending timeout.
  const queryKey = JSON.stringify([uc?.source, uc?.query, uc?.topics, uc?.collectionId]);
  const prevQueryKey = useRef(queryKey);
  useEffect(() => {
    if (!isActive || !proxyReady) return;
    if (prevQueryKey.current === queryKey) return;
    prevQueryKey.current = queryKey;
    const t = setTimeout(() => fetchRef.current(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [isActive, proxyReady, queryKey]);

  // Rotation scheduler — reruns after each successful fetch (attribution dep)
  const fetchedAt = attribution?.fetchedAt ?? 0;
  useEffect(() => {
    if (!isActive || !proxyReady || !fetchedAt) return;
    const rotation = uc?.rotationInterval ?? 86400;
    // 0 = 'every new tab' — only fetches on (re)mount, never on a recurring timer.
    if (rotation === 0) return;
    const interval = rotation * 1000;
    const delay    = Math.max(0, interval - (Date.now() - fetchedAt));
    const t = setTimeout(() => fetchRef.current(), delay);
    return () => clearTimeout(t);
  }, [isActive, proxyReady, uc?.rotationInterval, fetchedAt]);

  return {
    attribution,
    isFetching,
    error,
    isStale,
    fetchNow: fetchImage,
  };
}
