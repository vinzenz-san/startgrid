/**
 * Resolves an `![[drawing.excalidraw]]` embed target to the vault path of
 * its `.excalidraw.md` note, and fetches/caches the Excalidraw plugin's
 * auto-exported SVG for it.
 *
 * The Local REST API has no link-resolution endpoint — Obsidian itself
 * resolves an embed target that omits its folder by searching the whole
 * vault for a unique filename match (falling back to the shortest path when
 * more than one file shares that name). This mirrors that behaviour against
 * the flat vault index lib/obsidianIndex.ts already builds and caches, so no
 * extra REST calls are needed beyond what ObsidianRandom/VaultNotePicker
 * already pay for.
 */

import { getAsset, ObsidianError, type ObsidianErrorCode } from './obsidianApi';
import { storageLocal } from './storageLocal';

/** True for any vault path that is itself an Excalidraw note — shared by the
 *  `![[...]]` embed matcher in obsidianMarkdown.ts and by widgets (e.g.
 *  ObsidianNote) whose *own* configured path can point directly at a
 *  drawing, not just at a note that embeds one. */
export function isExcalidrawNotePath(path: string): boolean {
  return /\.excalidraw(?:\.md)?$/i.test(path.trim());
}

/** Normalizes an embed target to the `.md` filename Obsidian actually
 *  stores on disk. Users may type the target with or without the trailing
 *  `.md` — `![[drawing.excalidraw]]` and `![[drawing.excalidraw.md]]` refer
 *  to the same note. */
function toMdSuffix(target: string): string {
  const trimmed = target.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Resolve one embed target against a flat vault index (as returned by
 * `getVaultIndex().paths`). Returns null when nothing matches.
 *
 * - A target that includes a folder (`sub/drawing.excalidraw`) must match
 *   that path exactly (case-insensitive) — Obsidian only falls back to a
 *   vault-wide filename search when the embed gives no folder at all.
 * - A bare filename matches any note sharing that basename; when more than
 *   one does, the shortest path wins, same tie-break `searchIndex` already
 *   uses for the note picker's ranking.
 */
export function resolveExcalidrawPath(paths: string[], target: string): string | null {
  const want = toMdSuffix(target);
  const hasFolder = want.includes('/');

  if (hasFolder) {
    const wantLower = want.toLowerCase();
    const exact = paths.find(p => p.toLowerCase() === wantLower);
    if (exact) return exact;
    // The target's folder may be a suffix of a deeper path (e.g. the embed
    // omits an ancestor folder) — same latitude Obsidian itself gives.
    const suffixMatch = paths.find(p => p.toLowerCase().endsWith(`/${wantLower}`));
    return suffixMatch ?? null;
  }

  const wantBasename = want.toLowerCase();
  const candidates = paths.filter(p => basename(p).toLowerCase() === wantBasename);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates.reduce((shortest, p) => (p.length < shortest.length ? p : shortest));
}

/**
 * Derives candidate vault paths for the auto-exported SVG of a resolved
 * `.excalidraw.md` note, in the order they should be tried.
 *
 * The Excalidraw plugin's "Auto-export SVG" setting writes this file in the
 * same folder, replacing only the trailing `.md` — `drawing.excalidraw.md`
 * becomes `drawing.excalidraw.svg`, keeping the `.excalidraw` segment. An
 * earlier version of this function stripped that segment too (producing
 * `drawing.svg`), which 404'd against every real vault; that older/shorter
 * form is kept as a second candidate in case some vaults were exported under
 * a plugin version or setting that behaves differently.
 */
export function excalidrawSvgPaths(notePath: string): string[] {
  const primary = notePath.replace(/\.md$/i, '.svg');
  const legacy = notePath.replace(/\.excalidraw\.md$/i, '.svg');
  return legacy === primary ? [primary] : [primary, legacy];
}

// ── Fetch + cache ────────────────────────────────────────────────────────────

/** Above this, a drawing is treated as "open in Obsidian instead" rather
 *  than cached/rendered inline — a pathological SVG (many embedded raster
 *  images, base64-inlined) shouldn't blow out storage.local's quota or the
 *  newtab page's render cost. 800KB comfortably covers ordinary hand-drawn
 *  diagrams while catching the outliers. */
export const MAX_SVG_BYTES = 800_000;

export type ExcalidrawFetchErrorCode = ObsidianErrorCode | 'TOO_LARGE';

export interface ExcalidrawSvgResult {
  svg:           string;
  fetchedAt:     number;
  isStale:       boolean;
  errorCode:     ExcalidrawFetchErrorCode | null;
}

interface SvgCache {
  svg:       string;
  fetchedAt: number;
}

function cacheKey(notePath: string): string {
  return `sg:obsidian:excalidraw:svg:${notePath}`;
}

/** UTF-16 code units, not bytes, but close enough for an SVG (near-ASCII
 *  markup plus base64) to gate the cache/render cutoff without pulling in a
 *  TextEncoder round trip just to size-check. */
function isTooLarge(text: string): boolean {
  return text.length > MAX_SVG_BYTES;
}

/**
 * Fetches the auto-exported SVG for a resolved `.excalidraw.md` note path,
 * caching it in storage.local keyed by that path. On any failure (Obsidian
 * unreachable, export not enabled yet, oversized asset) falls back to the
 * last cached SVG for this exact note when one exists, marked stale — same
 * pattern as useObsidianNote.ts / useUnsplash.ts.
 */
export async function fetchExcalidrawSvg(notePath: string): Promise<ExcalidrawSvgResult> {
  const candidates = excalidrawSvgPaths(notePath);
  let lastCode: ExcalidrawFetchErrorCode = 'NOT_FOUND';

  for (const svgPath of candidates) {
    try {
      const svg = await getAsset(svgPath);
      if (isTooLarge(svg)) {
        return await fallbackOrError(notePath, 'TOO_LARGE');
      }
      const fetchedAt = Date.now();
      await storageLocal.set(cacheKey(notePath), { svg, fetchedAt } satisfies SvgCache);
      return { svg, fetchedAt, isStale: false, errorCode: null };
    } catch (err) {
      lastCode = err instanceof ObsidianError ? err.code : 'HTTP_ERROR';
      // Only a missing file is worth trying the next candidate for — an
      // auth/connectivity failure will fail the same way for every path.
      if (lastCode !== 'NOT_FOUND') break;
    }
  }

  return fallbackOrError(notePath, lastCode);
}

async function fallbackOrError(
  notePath: string,
  errorCode: ExcalidrawFetchErrorCode,
): Promise<ExcalidrawSvgResult> {
  const cached = await storageLocal.get(cacheKey(notePath)) as SvgCache | undefined;
  if (cached) {
    return { svg: cached.svg, fetchedAt: cached.fetchedAt, isStale: true, errorCode };
  }
  return { svg: '', fetchedAt: 0, isStale: false, errorCode };
}

/** Base64-encodes an SVG payload into a data URI, so it can be handed to a
 *  plain `<img>` — never injected into the DOM as markup. Vault content is
 *  untrusted (see obsidianMarkdown.ts's header for why the same rule governs
 *  the rest of this parser), and an SVG can carry `<script>`/`onload`
 *  payloads that a browser will happily execute if placed inline; routed
 *  through `<img src>` instead, the browser only ever rasterizes it. */
export function svgToDataUri(svg: string): string {
  // btoa is Latin1-only — encodeURIComponent/unescape round-trip handles the
  // rest of UTF-8 (SVGs commonly carry non-ASCII text: labels, arrows, …).
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}
