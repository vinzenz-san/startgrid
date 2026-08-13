import { useState, useCallback, useRef } from 'react';
import { getFile, saveNoteIfUnchanged, ObsidianError, type ObsidianErrorCode } from '../../../lib/obsidianApi';
import { parseMarkdown, type MdBlock } from '../../../lib/obsidianMarkdown';
import { isExtensionEnv, isScreenshotMode } from '../../../lib/permissions';
import { storageLocal } from '../../../lib/storageLocal';

export interface NoteState {
  status:        'idle' | 'loading' | 'success' | 'error';
  source:        string;
  blocks:        MdBlock[];
  errorCode:     ObsidianErrorCode | null;
  lastRefreshed: Date | null;
  isStale:       boolean;
  /** Set when a full-body save was refused because the note changed underneath us. */
  staleConflict: boolean;
}

interface NoteCache {
  source: string;
  fetchedAt: number;
}

function cacheKey(path: string): string {
  return `sg:obsidian:note:cache:${path}`;
}

const MOCK_SOURCE = [
  '## This week',
  '',
  'Ship the connection layer, then the read widgets.',
  '',
  '- Groceries: oat milk, coffee, rye bread',
  '- Call the bike shop about the service slot',
  '- [ ] Renew the domain #admin',
  '',
  '![[architecture.excalidraw]]',
  '',
  '> A pinned note is a notice board you keep from inside Obsidian.',
].join('\n');

export function useObsidianNote() {
  const [state, setState] = useState<NoteState>({
    status: 'idle',
    source: '',
    blocks: [],
    errorCode: null,
    lastRefreshed: null,
    isStale: false,
    staleConflict: false,
  });
  const [writing, setWriting] = useState(false);
  const fetchingRef = useRef(false);
  // The path in flight, so a save always writes back to the same note that
  // was read — not a newly-resolved one if the path setting just changed.
  const pathRef = useRef('');

  const refresh = useCallback(async (path: string) => {
    if (fetchingRef.current) return;
    if (!path) {
      setState(s => ({ ...s, status: 'error', source: '', blocks: [], errorCode: 'NOT_CONFIGURED', lastRefreshed: null, isStale: false }));
      return;
    }
    fetchingRef.current = true;
    pathRef.current = path;
    setState(s => ({ ...s, status: 'loading', errorCode: null, staleConflict: false }));

    try {
      let source: string;
      if (isExtensionEnv && !isScreenshotMode()) {
        source = await getFile(path);
      } else {
        await new Promise(r => setTimeout(r, 450));
        source = MOCK_SOURCE;
      }
      setState({
        status: 'success',
        source,
        blocks: parseMarkdown(source),
        errorCode: null,
        lastRefreshed: new Date(),
        isStale: false,
        staleConflict: false,
      });
      storageLocal.set(cacheKey(path), { source, fetchedAt: Date.now() } satisfies NoteCache);
    } catch (err) {
      // Fall back to the last cached content for this exact path rather than
      // a bare error when one exists — same reasoning as useObsidianDaily.ts.
      const cached = await storageLocal.get(cacheKey(path));
      const c = cached as NoteCache | undefined;
      if (c) {
        setState({
          status: 'success',
          source: c.source,
          blocks: parseMarkdown(c.source),
          errorCode: null,
          lastRefreshed: new Date(c.fetchedAt),
          isStale: true,
          staleConflict: false,
        });
      } else {
        setState({
          status: 'error',
          source: '',
          blocks: [],
          errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
          lastRefreshed: null,
          isStale: false,
          staleConflict: false,
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  /**
   * Save a full-body edit. Re-reads the note first and only writes if it
   * still matches `expectedSource` — same conflict check useObsidianDaily.ts
   * uses for checkbox toggles, generalized to the whole note.
   */
  const saveEdit = useCallback(async (expectedSource: string, newSource: string) => {
    const path = pathRef.current;
    if (!path || !isExtensionEnv || isScreenshotMode()) {
      setState(s => ({ ...s, source: newSource, blocks: parseMarkdown(newSource) }));
      return true;
    }

    setWriting(true);
    try {
      const result = await saveNoteIfUnchanged(path, expectedSource, newSource);
      if (result === 'conflict') {
        await refresh(path);
        setState(s => ({ ...s, staleConflict: true }));
        return false;
      }
      setState(s => ({
        ...s,
        source: newSource,
        blocks: parseMarkdown(newSource),
        staleConflict: false,
        lastRefreshed: new Date(),
      }));
      return true;
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
      }));
      return false;
    } finally {
      setWriting(false);
    }
  }, [refresh]);

  return { ...state, writing, refresh, saveEdit, isMock: !isExtensionEnv || isScreenshotMode() };
}
