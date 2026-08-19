import { useCallback, useEffect, useRef, useState } from 'react';
import { storageLocal } from '../lib/storageLocal';
import { getValidToken } from '../lib/googleAuth';
import { fetchTasks, type GoogleTask } from '../lib/googleTasksApi';

const CACHE_TTL_MS = 15 * 60 * 1000; // same TTL as useRssFeed.ts

interface TasksCache {
  tasks: GoogleTask[];
  fetchedAt: number;
}

function cacheKey(taskListId: string): string {
  return `sg:googleTasks:cache:${taskListId}`;
}

export type GoogleTasksStatus = 'idle' | 'loading' | 'success' | 'error' | 'unauthenticated';

interface Params {
  taskListId?: string;
}

/**
 * Fetches Google Tasks for a given task list, caching to `storage.local`
 * (15-minute TTL). Resolves to `'unauthenticated'` status if no valid OAuth
 * token is available, and falls back to cached tasks (flagging `isStale`)
 * rather than erroring when a refetch fails but a prior cache exists.
 */
export function useGoogleTasks({ taskListId }: Params) {
  const hasList = !!taskListId;

  const [status, setStatus] = useState<GoogleTasksStatus>('idle');
  const [tasks, setTasks]   = useState<GoogleTask[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const fetchRef = useRef<() => Promise<void>>(async () => {});
  const requestIdRef = useRef(0);

  const fetchTasksNow = useCallback(async () => {
    if (!taskListId) return;
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const token = await getValidToken();
      if (!token) {
        if (requestIdRef.current !== requestId) return;
        setStatus('unauthenticated');
        return;
      }
      const result = await fetchTasks(token, taskListId);
      if (requestIdRef.current !== requestId) return;
      setTasks(result);
      setStatus('success');
      setIsStale(false);
      storageLocal.set(cacheKey(taskListId), { tasks: result, fetchedAt: Date.now() } satisfies TasksCache);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        setStatus('unauthenticated');
        return;
      }
      const message = err instanceof Error ? err.message : 'Fetch failed';
      // Fall back to the last cached tasks rather than a bare error when one
      // exists — same reasoning as useRssFeed.ts/useWeather.ts.
      const cached = await storageLocal.get(cacheKey(taskListId));
      if (requestIdRef.current !== requestId) return;
      const c = cached as TasksCache | undefined;
      if (c) {
        setTasks(c.tasks);
        setStatus('success');
        setIsStale(true);
      } else {
        setError(message);
        setStatus('error');
      }
    }
  }, [taskListId]);

  useEffect(() => { fetchRef.current = fetchTasksNow; }, [fetchTasksNow]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!hasList || !taskListId) { setTasks([]); setStatus('idle'); setIsStale(false); return; }
    const key = cacheKey(taskListId);
    storageLocal.get(key).then(cached => {
      if (requestIdRef.current !== requestId) return;
      const c = cached as TasksCache | undefined;
      if (c && Date.now() - c.fetchedAt < CACHE_TTL_MS) {
        setTasks(c.tasks);
        setStatus('success');
        setIsStale(false);
      } else {
        fetchRef.current();
      }
    });
  }, [hasList, taskListId]);

  return { status, tasks, error, isStale, refetch: fetchTasksNow };
}
