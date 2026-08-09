import { useState, useCallback, useRef } from 'react';
import { getFile, ObsidianError, type ObsidianErrorCode } from '../../../lib/obsidianApi';
import { getVaultIndex, pickRandom } from '../../../lib/obsidianIndex';
import { parseMarkdown, stripInline, type MdBlock } from '../../../lib/obsidianMarkdown';
import { isExtensionEnv, isScreenshotMode } from '../../../lib/permissions';

export interface RandomState {
  /** 'indexing' is the cold-cache walk — slow enough to deserve its own state. */
  status:    'idle' | 'indexing' | 'loading' | 'success' | 'error';
  path:      string;
  blocks:    MdBlock[];
  errorCode: ObsidianErrorCode | null;
  truncated: boolean;
  vaultSize: number;
}

const EMPTY: RandomState = {
  status: 'idle',
  path: '',
  blocks: [],
  errorCode: null,
  truncated: false,
  vaultSize: 0,
};

const MOCK_NOTES: Record<string, string> = {
  'Reference/Spaced repetition.md':
    '# Spaced repetition\n\nReviewing just before you would have forgotten is what makes it stick.\n\n- Intervals grow after each success\n- A lapse resets the ladder\n\nSee [[Memory]] for the underlying idea. #learning',
  'Projects/Bike rebuild.md':
    '# Bike rebuild\n\nBottom bracket replaced. Still to do:\n\n- [ ] Bleed the rear brake\n- [ ] Re-tape the bars\n\n> Ride it before deciding on the saddle.',
  'Notes/On tools.md':
    '# On tools\n\nA tool you have to visit is a tool you forget.\n\nThe useful ones meet you where you already are. #thinking',
};

export function useObsidianRandom() {
  const [state, setState] = useState<RandomState>(EMPTY);
  const busyRef = useRef(false);
  const lastPathRef = useRef<string | undefined>(undefined);

  const shuffle = useCallback(async (excludeFolders: string[] = [], force = false) => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      if (!isExtensionEnv || isScreenshotMode()) {
        setState(s => ({ ...s, status: 'loading' }));
        await new Promise(r => setTimeout(r, 350));
        const keys = Object.keys(MOCK_NOTES);
        const path = pickRandom(keys, lastPathRef.current) ?? keys[0];
        lastPathRef.current = path;
        setState({
          status: 'success',
          path,
          blocks: parseMarkdown(MOCK_NOTES[path]),
          errorCode: null,
          truncated: false,
          vaultSize: keys.length,
        });
        return;
      }

      setState(s => ({ ...s, status: s.vaultSize ? 'loading' : 'indexing', errorCode: null }));
      const index = await getVaultIndex(excludeFolders, { force });

      const path = pickRandom(index.paths, lastPathRef.current);
      if (!path) {
        setState({ ...EMPTY, status: 'error', errorCode: 'NOT_FOUND', truncated: index.truncated });
        return;
      }
      lastPathRef.current = path;

      setState(s => ({ ...s, status: 'loading', path, truncated: index.truncated, vaultSize: index.paths.length }));
      const source = await getFile(path);

      setState({
        status: 'success',
        path,
        blocks: parseMarkdown(source),
        errorCode: null,
        truncated: index.truncated,
        vaultSize: index.paths.length,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        blocks: [],
        errorCode: err instanceof ObsidianError ? err.code : 'HTTP_ERROR',
      }));
    } finally {
      busyRef.current = false;
    }
  }, []);

  return { ...state, shuffle, isMock: !isExtensionEnv || isScreenshotMode() };
}

/** First non-heading line of a note, flattened — the excerpt shown when the
 *  widget is set to summarise rather than render. */
export function firstLines(blocks: MdBlock[], count: number): string {
  return blocks
    .filter(b => b.kind !== 'heading' && b.kind !== 'hr' && b.kind !== 'code')
    .slice(0, count)
    .map(b => ('text' in b ? stripInline(b.text) : ''))
    .filter(Boolean)
    .join(' ');
}
