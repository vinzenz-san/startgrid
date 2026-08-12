/**
 * Flat vault file index.
 *
 * The Local REST API only lists one directory at a time — there is no
 * recursive listing endpoint — so "pick a random note" means walking the tree.
 * On a large vault that is a lot of requests, and a new tab page must not fire
 * them on every open. Hence: walk once, cache the flat list in storage.local
 * with a TTL, and hard-cap the walk so a pathological vault can't spin.
 */

import { listDirectory } from './obsidianApi';
import { storageLocal } from './storageLocal';

export const INDEX_CACHE_KEY = 'sg_obsidian_filecache';

const DEFAULT_TTL_MS   = 6 * 60 * 60 * 1000; // 6 hours
const MAX_REQUESTS     = 300;                // directories visited per walk
const MAX_DEPTH        = 8;

/** Folders skipped regardless of user settings — never interesting to surface
 *  and, in the case of `.obsidian`, not user content at all. */
const ALWAYS_EXCLUDED = ['.obsidian', '.trash', '.git'];

interface CachedIndex {
  paths:     string[];
  builtAt:   number;
  /** Recorded so a changed exclude list invalidates the cache. */
  excludeKey: string;
  truncated: boolean;
}

export interface VaultIndex {
  paths:     string[];
  builtAt:   Date;
  /** True when the walk hit its request/depth cap and the list is partial. */
  truncated: boolean;
}

function normalizeExcludes(excludeFolders: string[] = []): string[] {
  return [...ALWAYS_EXCLUDED, ...excludeFolders]
    .map(f => f.trim().replace(/^\/+|\/+$/g, '').toLowerCase())
    .filter(Boolean);
}

function isExcluded(segment: string, excludes: string[]): boolean {
  return excludes.includes(segment.toLowerCase());
}

/** Breadth-first so a wide, shallow vault indexes usefully even if capped. */
async function walkVault(excludes: string[]): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: '', depth: 0 }];
  let requests = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (requests >= MAX_REQUESTS) { truncated = true; break; }
    const { dir, depth } = queue.shift()!;
    requests += 1;

    let entries;
    try {
      entries = await listDirectory(dir);
    } catch {
      // A single unreadable folder shouldn't sink the whole index.
      continue;
    }

    for (const entry of entries) {
      if (isExcluded(entry.name, excludes)) continue;
      const full = dir ? `${dir}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        if (depth + 1 <= MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 });
        else truncated = true;
      } else if (/\.md$/i.test(entry.name)) {
        paths.push(full);
      }
    }
  }

  return { paths, truncated };
}

/**
 * Return the vault index, rebuilding it when missing, stale, or built against
 * a different exclude list. Pass `force` for the user-initiated rebuild.
 */
export async function getVaultIndex(
  excludeFolders: string[] = [],
  opts: { force?: boolean; ttlMs?: number } = {},
): Promise<VaultIndex> {
  const excludes   = normalizeExcludes(excludeFolders);
  const excludeKey = excludes.join('|');
  const ttl        = opts.ttlMs ?? DEFAULT_TTL_MS;

  if (!opts.force) {
    const cached = await storageLocal.get(INDEX_CACHE_KEY) as CachedIndex | undefined;
    if (
      cached?.paths?.length &&
      cached.excludeKey === excludeKey &&
      Date.now() - cached.builtAt < ttl
    ) {
      return { paths: cached.paths, builtAt: new Date(cached.builtAt), truncated: cached.truncated };
    }
  }

  const { paths, truncated } = await walkVault(excludes);
  const builtAt = Date.now();
  await storageLocal.set(INDEX_CACHE_KEY, { paths, builtAt, excludeKey, truncated } satisfies CachedIndex);
  return { paths, builtAt: new Date(builtAt), truncated };
}

export async function clearVaultIndex(): Promise<void> {
  await storageLocal.remove(INDEX_CACHE_KEY);
}

/** Pick a random entry, avoiding an immediate repeat where possible. */
export function pickRandom(paths: string[], avoid?: string): string | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return paths[0];
  const pool = avoid ? paths.filter(p => p !== avoid) : paths;
  return pool[Math.floor(Math.random() * pool.length)] ?? paths[0];
}

/** Case-insensitive substring filter over a vault index, for a note-picker
 *  combobox — sorted so matches near the start of the filename (not just
 *  anywhere in the full path) rank first, since that's usually what a user
 *  typing a note's name is looking for. Capped so a broad query against a
 *  huge vault doesn't render an unbounded list. */
export function searchIndex(paths: string[], query: string, limit = 30): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = paths.filter(p => p.toLowerCase().includes(q));
  const filenameOf = (p: string) => (p.split('/').pop() ?? p).toLowerCase();
  // -1 (query only found in a folder segment, not the filename) sorts last,
  // not first — an unmodified indexOf would otherwise rank those above real
  // filename-prefix matches, since -1 < 0.
  const rank = (p: string) => { const i = filenameOf(p).indexOf(q); return i === -1 ? Infinity : i; };
  matches.sort((a, b) => rank(a) - rank(b));
  return matches.slice(0, limit);
}

export interface FolderListing {
  /** Immediate subfolder names at this level (not full paths). */
  folders: string[];
  /** Immediate notes at this level. */
  notes: { name: string; path: string }[];
}

/** Derives one folder's immediate contents from the flat vault index — there
 *  is no real folder object anywhere (the index is just a list of `.md`
 *  paths), so this groups by path segment on demand instead of maintaining
 *  a separate tree structure. Used for the note-picker's explorer view;
 *  `folder` is a vault-relative path with no leading/trailing slash, ''
 *  for the vault root. */
export function listFolder(paths: string[], folder: string): FolderListing {
  const prefix = folder ? `${folder}/` : '';
  const folderSet = new Set<string>();
  const notes: { name: string; path: string }[] = [];

  for (const path of paths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      notes.push({ name: rest, path });
    } else {
      folderSet.add(rest.slice(0, slash));
    }
  }

  return {
    folders: [...folderSet].sort((a, b) => a.localeCompare(b)),
    notes: notes.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
