import { useEffect, useState } from 'react';
import { getVaultIndex } from '../../../lib/obsidianIndex';
import {
  resolveExcalidrawPath,
  fetchExcalidrawSvg,
  svgToDataUri,
  type ExcalidrawFetchErrorCode,
} from '../../../lib/obsidianExcalidraw';
import { openInObsidian } from '../../../lib/obsidianApi';
import { isExtensionEnv, isScreenshotMode } from '../../../lib/permissions';
import { IconOpenExternal } from './ObsidianIcons';

type EmbedState =
  | { status: 'loading' }
  | { status: 'ready'; dataUri: string; isStale: boolean }
  // Covers both "no note in the vault matches this embed" and every
  // ExcalidrawFetchErrorCode — the placeholder copy is the same either way:
  // there is nothing to preview yet, only "open it in Obsidian" is offered.
  | { status: 'unavailable'; reason: 'UNRESOLVED' | ExcalidrawFetchErrorCode };

// A small inline sample so the preview build and onboarding screenshots show
// something concrete instead of every embed rendering as an empty box — same
// reasoning as the other Obsidian widgets' MOCK_SOURCE constants.
const MOCK_SVG_DATA_URI =
  'data:image/svg+xml;base64,' + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140">' +
    '<rect x="1" y="1" width="238" height="138" rx="8" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="6 5"/>' +
    '<text x="120" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#a78bfa">Excalidraw drawing</text>' +
    '</svg>',
  );

/** Resolves and renders an `![[drawing.excalidraw]]` embed found in a note's
 *  Markdown, as parsed by lib/obsidianMarkdown.ts's `embed` token. Always
 *  goes through an `<img src="data:...">`, never inline SVG markup — vault
 *  content is untrusted, see obsidianMarkdown.ts's header. */
export default function ExcalidrawEmbed({ target }: { target: string }) {
  const [state, setState] = useState<EmbedState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isExtensionEnv || isScreenshotMode()) {
        // Dev/preview build or deliberate screenshot mode — same "no live
        // vault to talk to" gate every other Obsidian widget uses.
        await new Promise(r => setTimeout(r, 300));
        if (!cancelled) setState({ status: 'ready', dataUri: MOCK_SVG_DATA_URI, isStale: false });
        return;
      }

      setState({ status: 'loading' });
      try {
        const { paths } = await getVaultIndex();
        const notePath = resolveExcalidrawPath(paths, target);
        if (!notePath) {
          if (!cancelled) setState({ status: 'unavailable', reason: 'UNRESOLVED' });
          return;
        }

        const result = await fetchExcalidrawSvg(notePath);
        if (cancelled) return;
        if (!result.svg) {
          setState({ status: 'unavailable', reason: result.errorCode ?? 'HTTP_ERROR' });
          return;
        }
        setState({ status: 'ready', dataUri: svgToDataUri(result.svg), isStale: result.isStale });
      } catch {
        if (!cancelled) setState({ status: 'unavailable', reason: 'HTTP_ERROR' });
      }
    }

    run();
    return () => { cancelled = true; };
  }, [target]);

  // Best-effort: the raw embed target, which Obsidian's own `/open/`
  // endpoint can usually resolve itself even without the `.md`/folder we'd
  // otherwise need to have resolved locally.
  const openTarget = () => { openInObsidian(target).catch(() => {}); };

  if (state.status === 'loading') {
    return <span className="sg-md-embed-frame sg-md-embed-frame--loading" aria-hidden="true" />;
  }

  if (state.status === 'ready') {
    return (
      <span className={`sg-md-embed-frame${state.isStale ? ' sg-md-embed-frame--stale' : ''}`}>
        <img src={state.dataUri} alt={target} className="sg-md-embed-img" />
      </span>
    );
  }

  if (state.reason === 'NOT_FOUND' || state.reason === 'UNRESOLVED') {
    // The common case: the drawing exists but nothing has exported an SVG
    // for it yet (Auto-export SVG off, or the drawing has never been
    // resaved since it was turned on).
    return (
      <span className="sg-md-embed-frame sg-md-embed-frame--empty">
        <span className="sg-md-embed-empty-title">Excalidraw Preview Unavailable</span>
        <span className="sg-md-embed-empty-hint">
          Excalidraw settings → Embedding Excalidraw into your Notes and Exporting → Export Settings → Auto-export SVG
        </span>
        <span className="sg-md-embed-empty-text">Open and save the drawing in Obsidian once to generate the SVG.</span>
        <button type="button" className="sg-md-embed-open-btn" onClick={openTarget}>
          <IconOpenExternal /> Open in Obsidian
        </button>
      </span>
    );
  }

  const hint = state.reason === 'TOO_LARGE'
    ? 'Drawing is too large to preview here'
    : 'Could not reach Obsidian';

  return (
    <span className="sg-md-embed-frame sg-md-embed-frame--empty">
      <span className="sg-md-embed-empty-text">{hint}</span>
      <button type="button" className="sg-md-embed-open-btn" onClick={openTarget}>
        <IconOpenExternal /> Open in Obsidian
      </button>
    </span>
  );
}
