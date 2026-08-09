import { useState, useCallback, useRef } from 'react';
import { getFile, putFile, saveNoteIfUnchanged, ObsidianError, type ObsidianErrorCode } from '../../../lib/obsidianApi';
import { parseMarkdown, toggleTaskLine, type MdBlock } from '../../../lib/obsidianMarkdown';
import { isExtensionEnv, isScreenshotMode } from '../../../lib/permissions';
import { storageLocal } from '../../../lib/storageLocal';

export type DailyStatus = 'idle' | 'loading' | 'success' | 'error';

interface DailyState {
  status:        DailyStatus;
  /** Raw note source — kept so a checkbox write can be composed from the exact
   *  text that was rendered, not a re-serialisation of the parsed blocks. */
  source:        string;
  blocks:        MdBlock[];
  errorCode:     ObsidianErrorCode | null;
  lastRefreshed: Date | null;
  /** Set when a write was refused because the note changed underneath us. */
  staleConflict: boolean;
  isStale:       boolean;
}

const EMPTY: DailyState = {
  status: 'idle',
  source: '',
  blocks: [],
  errorCode: null,
  lastRefreshed: null,
  staleConflict: false,
  isStale: false,
};

interface NoteCache {
  source: string;
  fetchedAt: number;
}

function cacheKey(path: string): string {
  return `sg:obsidian:daily:cache:${path}`;
}

// ── Mock data — the browser preview has no extension APIs and no vault ────────

const MOCK_SOURCE = [
  '# Focus',
  '',
  'Ship the **Obsidian widgets** branch. See [[Roadmap]] for the rest.',
  '',
  '## Tasks',
  '',
  '- [x] Draft the transport comparison',
  '- [ ] Wire up the connection layer',
  '- [ ] Write the setup docs #docs',
  '- [ ] Review [the plugin API](https://github.com/coddingtonbear/obsidian-local-rest-api)',
  '',
  '## Notes',
  '',
  '> Keep the new tab fast — read surfaces only.',
].join('\n');

async function fetchMock(): Promise<string> {
  await new Promise(r => setTimeout(r, 500));
  return MOCK_SOURCE;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useObsidianDaily() {
  const [state, setState] = useState<DailyState>(EMPTY);
  const [writing, setWriting] = useState(false);
  const fetchingRef = useRef(false);
  // The path in flight, so a checkbox toggle always writes back to the same
  // note that was read — not a newly-resolved one if midnight just passed.
  const pathRef = useRef('');

  const refresh = useCallback(async (path: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    pathRef.current = path;
    setState(s => ({ ...s, status: 'loading', errorCode: null, staleConflict: false }));

    try {
      const source = (isExtensionEnv && !isScreenshotMode()) ? await getFile(path) : await fetchMock();
      setState({
        status: 'success',
        source,
        blocks: parseMarkdown(source),
        errorCode: null,
        lastRefreshed: new Date(),
        staleConflict: false,
        isStale: false,
      });
      storageLocal.set(cacheKey(path), { source, fetchedAt: Date.now() } satisfies NoteCache);
    } catch (err) {
      // Fall back to the last cached content for this exact path rather than
      // a bare error when one exists — same reasoning as useWeather.ts, but
      // no TTL: unlike weather/rates, a note's content doesn't drift on its
      // own, so any previously-fetched copy of the same path is still valid
      // to show while a fresh refresh keeps failing.
      const cached = await storageLocal.get(cacheKey(path));
      const c = cached as NoteCache | undefined;
      if (c) {
        setState({
          status: 'success',
          source: c.source,
          blocks: parseMarkdown(c.source),
          errorCode: null,
          lastRefreshed: new Date(c.fetchedAt),
          staleConflict: false,
          isStale: true,
        });
      } else {
        setState(s => ({
          ...s,
          status: 'error',
          source: '',
          blocks: [],
          errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
          isStale: false,
        }));
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  /**
   * Tick a task off.
   *
   * The plugin exposes a PATCH endpoint, but targeting one arbitrary list item
   * through it is fragile. Instead: re-read the note, confirm the target line
   * is still the same task we rendered, and only then write the whole file
   * back with that single character flipped. If it no longer matches, the note
   * was edited in Obsidian since the last refresh — refuse the write and
   * refresh, rather than clobbering that edit.
   */
  const toggleTask = useCallback(async (block: Extract<MdBlock, { kind: 'task' }>) => {
    const path = pathRef.current;
    if (!path || !isExtensionEnv || isScreenshotMode()) {
      // Preview build (or Screenshot Mode): reflect the toggle locally so the widget still demos.
      setState(s => ({
        ...s,
        blocks: s.blocks.map(b =>
          b.kind === 'task' && b.lineIndex === block.lineIndex ? { ...b, checked: !b.checked } : b,
        ),
      }));
      return;
    }

    setWriting(true);
    try {
      const current = await getFile(path);
      const updated = toggleTaskLine(current, block.lineIndex, block.text, !block.checked);

      if (updated === null) {
        setState(s => ({
          ...s,
          source: current,
          blocks: parseMarkdown(current),
          staleConflict: true,
          lastRefreshed: new Date(),
        }));
        return;
      }

      await putFile(path, updated);
      setState(s => ({
        ...s,
        source: updated,
        blocks: parseMarkdown(updated),
        staleConflict: false,
        lastRefreshed: new Date(),
      }));
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
      }));
    } finally {
      setWriting(false);
    }
  }, []);

  /**
   * Save a full-body edit. Same re-read-then-write conflict check as
   * toggleTask, but for the whole note rather than one line.
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

  /** Create today's note when it doesn't exist yet. */
  const createNote = useCallback(async (path: string, initial = '') => {
    if (!isExtensionEnv || isScreenshotMode()) return;
    setWriting(true);
    try {
      await putFile(path, initial);
      await refresh(path);
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
      }));
    } finally {
      setWriting(false);
    }
  }, [refresh]);

  return { ...state, writing, refresh, toggleTask, createNote, saveEdit, isMock: !isExtensionEnv || isScreenshotMode() };
}
