import { useCallback, useEffect, useRef, useState } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { fetchFeed, type FeedItem } from '../lib/rssApi';
import { isExtensionEnv } from '../lib/permissions';
import { MOCK_FEED_ITEMS, MOCK_FEED_TITLE } from '../components/widgets/RssFeed/rssFeed.mock';

const DEFAULT_TTL_MIN = 30;

interface FeedCache {
  feedTitle?: string;
  items: FeedItem[];
  fetchedAt: number;
}

function cacheKey(feedUrl: string): string {
  return `sg:rss:cache:${feedUrl}`;
}

export type RssFeedStatus = 'idle' | 'loading' | 'success' | 'error';

interface Params {
  feedUrl?: string;
  refreshIntervalMin?: number;
}

export function useRssFeed({ feedUrl, refreshIntervalMin }: Params) {
  const hasFeed = !!feedUrl;
  const ttlMs = (refreshIntervalMin ?? DEFAULT_TTL_MIN) * 60 * 1000;

  const [status, setStatus]     = useState<RssFeedStatus>('idle');
  const [items, setItems]       = useState<FeedItem[]>([]);
  const [feedTitle, setFeedTitle] = useState<string | undefined>(undefined);
  const [error, setError]       = useState<string | null>(null);
  const [isStale, setIsStale]   = useState(false);
  const [isDemo, setIsDemo]     = useState(false);

  const fetchRef = useRef<() => Promise<void>>(async () => {});

  // Bumped on every param change and by fetchFeedNow's own start — a resolved
  // async call only applies its result if it's still the most recent one
  // requested, so switching the feed URL mid-flight can't clobber the newer
  // request's state with a stale one. Same pattern as useWeather.ts.
  const requestIdRef = useRef(0);

  const fetchFeedNow = useCallback(async () => {
    if (!feedUrl) return;
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await fetchFeed(feedUrl);
      if (requestIdRef.current !== requestId) return;
      setItems(result.items);
      setFeedTitle(result.feedTitle);
      setStatus('success');
      setIsStale(false);
      setIsDemo(false);
      const cache: FeedCache = { feedTitle: result.feedTitle, items: result.items, fetchedAt: Date.now() };
      storageLocal.set(cacheKey(feedUrl), cache);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Fetch failed');
      // Fall back to the last cached items (regardless of TTL) rather than a
      // bare error state when a cache exists — same reasoning as useWeather.ts.
      const cached = await storageLocal.get(cacheKey(feedUrl));
      if (requestIdRef.current !== requestId) return;
      const c = cached as FeedCache | undefined;
      if (c) {
        setItems(c.items);
        setFeedTitle(c.feedTitle);
        setStatus('success');
        setIsStale(true);
        setIsDemo(false);
      } else if (!isExtensionEnv) {
        // Web preview (docs/preview) has no guarantee every visitor's browser
        // can reach the proxy Worker (CORS/network setup varies) — rather than
        // a bare error on a first-ever load with nothing cached yet, show
        // clearly-labelled sample content so the widget still demos well.
        setItems(MOCK_FEED_ITEMS);
        setFeedTitle(MOCK_FEED_TITLE);
        setStatus('success');
        setIsStale(false);
        setIsDemo(true);
      } else {
        setStatus('error');
      }
    }
  }, [feedUrl]);

  useEffect(() => { fetchRef.current = fetchFeedNow; }, [fetchFeedNow]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!hasFeed || !feedUrl) { setItems([]); setFeedTitle(undefined); setStatus('idle'); setIsStale(false); setIsDemo(false); return; }
    const key = cacheKey(feedUrl);
    storageLocal.get(key).then(cached => {
      if (requestIdRef.current !== requestId) return;
      const c = cached as FeedCache | undefined;
      if (c && Date.now() - c.fetchedAt < ttlMs) {
        setItems(c.items);
        setFeedTitle(c.feedTitle);
        setStatus('success');
        setIsStale(false);
        setIsDemo(false);
      } else {
        fetchRef.current();
      }
    });
  }, [hasFeed, feedUrl, ttlMs]);

  return { status, items, feedTitle, error, isStale, isDemo, refetch: fetchFeedNow };
}
