/**
 * Client for the Obsidian "Local REST API" community plugin.
 *
 * ── Why HTTP and not HTTPS ───────────────────────────────────────────────────
 * The plugin defaults to HTTPS on port 27124 with a *self-signed* certificate.
 * `fetch()` rejects that outright and an extension has no way to click through
 * a certificate warning, so the only workable target is the plugin's opt-in
 * HTTP server on 27123 ("Enable HTTP server" in its settings). This is a setup
 * step we document rather than something the extension can work around.
 *
 * Loopback HTTP is still a secure context as far as the browser is concerned
 * (127.0.0.1 is "potentially trustworthy"), so no mixed-content error, and
 * with the host permission granted the request is exempt from CORS — which
 * matters because the plugin does not document any CORS behaviour.
 *
 * ── Where the credentials live ───────────────────────────────────────────────
 * `browser.storage.local`, never `storage.sync` — the same rule msAuth.ts
 * applies to OAuth tokens. An API key must not ride Chrome/Mozilla Sync to
 * other machines, and a vault path is meaningless on a machine without that
 * vault anyway.
 */

import { storageLocal } from './storageLocal';
import { hasObsidianHostPermission } from './permissions';

export const OBSIDIAN_CONN_KEY = 'sg_obsidian_conn';
export const DEFAULT_BASE_URL  = 'http://127.0.0.1:27123';

export interface ObsidianConnection {
  baseUrl:    string;
  apiKey:     string;
  /** Only needed by the `obsidian://` URI transport (Quick Capture fallback). */
  vaultName?: string;
}

/** Every failure mode the widgets need to render differently. `UNREACHABLE`
 *  is the *common* case — Obsidian simply isn't running — and deserves its own
 *  calm empty state rather than an error. */
export type ObsidianErrorCode =
  | 'NOT_CONFIGURED'
  | 'NO_PERMISSION'
  | 'UNREACHABLE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'HTTP_ERROR';

export class ObsidianError extends Error {
  constructor(public code: ObsidianErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ObsidianError';
  }
}

// ── Connection record ─────────────────────────────────────────────────────────

export async function getConnection(): Promise<ObsidianConnection | null> {
  const stored = await storageLocal.get(OBSIDIAN_CONN_KEY);
  if (!stored || typeof stored !== 'object') return null;
  const conn = stored as Partial<ObsidianConnection>;
  if (!conn.apiKey) return null;
  return {
    baseUrl:   (conn.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey:    conn.apiKey,
    vaultName: conn.vaultName,
  };
}

export async function setConnection(conn: ObsidianConnection): Promise<void> {
  await storageLocal.set(OBSIDIAN_CONN_KEY, {
    baseUrl:   conn.baseUrl.replace(/\/+$/, '') || DEFAULT_BASE_URL,
    apiKey:    conn.apiKey,
    vaultName: conn.vaultName,
  });
}

export async function clearConnection(): Promise<void> {
  await storageLocal.remove(OBSIDIAN_CONN_KEY);
}

// ── Core request ──────────────────────────────────────────────────────────────

/** Vault paths go in the URL path, so each segment is encoded individually —
 *  encoding the whole thing would turn the separators into %2F and 404. */
function encodeVaultPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

interface RequestOptions {
  method?:      string;
  body?:        string;
  contentType?: string;
  /** Accept header — the plugin returns note metadata as JSON only when asked. */
  accept?:      string;
  /** Skip the bearer token (only the root status endpoint is unauthenticated). */
  anonymous?:   boolean;
}

async function request(
  conn: ObsidianConnection,
  path: string,
  opts: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (!opts.anonymous)  headers.Authorization = `Bearer ${conn.apiKey}`;
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  if (opts.accept)      headers.Accept = opts.accept;

  let res: Response;
  try {
    res = await fetch(`${conn.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body,
    });
  } catch {
    // A network-level throw here means the server didn't answer at all:
    // Obsidian closed, plugin disabled, HTTP server off, or wrong port.
    // It is indistinguishable from a blocked request, and in practice the
    // permission is checked before we ever get here.
    throw new ObsidianError('UNREACHABLE');
  }

  if (res.status === 401 || res.status === 403) throw new ObsidianError('UNAUTHORIZED');
  if (res.status === 404) throw new ObsidianError('NOT_FOUND');
  if (!res.ok) throw new ObsidianError('HTTP_ERROR', `${res.status} ${res.statusText}`);
  return res;
}

/** Resolve the connection and confirm the host permission before any call. */
async function ready(): Promise<ObsidianConnection> {
  const conn = await getConnection();
  if (!conn) throw new ObsidianError('NOT_CONFIGURED');
  if (!(await hasObsidianHostPermission())) throw new ObsidianError('NO_PERMISSION');
  return conn;
}

// ── Operations ────────────────────────────────────────────────────────────────

/** Raw Markdown of a note. Throws NOT_FOUND when the note doesn't exist yet —
 *  which for a daily note simply means today hasn't been created. */
export async function getFile(path: string): Promise<string> {
  const conn = await ready();
  const res = await request(conn, `/vault/${encodeVaultPath(path)}`, {
    accept: 'text/markdown',
  });
  return res.text();
}

/** Raw text of a non-Markdown vault asset (e.g. an auto-exported SVG sitting
 *  next to a `.excalidraw.md` note). Same NOT_FOUND-on-missing behaviour as
 *  `getFile` — callers use that to tell "not exported yet" apart from other
 *  failures. */
export async function getAsset(path: string, accept = 'image/svg+xml'): Promise<string> {
  const conn = await ready();
  const res = await request(conn, `/vault/${encodeVaultPath(path)}`, { accept });
  return res.text();
}

/** Replace a note's entire contents, creating it if absent. */
export async function putFile(path: string, content: string): Promise<void> {
  const conn = await ready();
  await request(conn, `/vault/${encodeVaultPath(path)}`, {
    method: 'PUT',
    body: content,
    contentType: 'text/markdown',
  });
}

/** Append to a note, creating it if absent. */
export async function appendToFile(path: string, content: string): Promise<void> {
  const conn = await ready();
  await request(conn, `/vault/${encodeVaultPath(path)}`, {
    method: 'POST',
    body: content,
    contentType: 'text/markdown',
  });
}

export interface VaultEntry {
  /** Directory entries come back with a trailing slash; files don't. */
  name:        string;
  isDirectory: boolean;
}

/** List one directory. `path` is '' for the vault root. The plugin exposes no
 *  recursive listing, which is why ObsidianRandom has to walk and cache. */
export async function listDirectory(path = ''): Promise<VaultEntry[]> {
  const conn = await ready();
  const encoded = path ? `${encodeVaultPath(path)}/` : '';
  const res = await request(conn, `/vault/${encoded}`, { accept: 'application/json' });
  const data = await res.json() as { files?: string[] };
  return (data.files ?? []).map(name => ({
    name: name.replace(/\/$/, ''),
    isDirectory: name.endsWith('/'),
  }));
}

export interface SearchHit {
  path:    string;
  /** Surrounding text for the match, as returned by the plugin. */
  context: string;
}

export async function simpleSearch(query: string, contextLength = 100): Promise<SearchHit[]> {
  const conn = await ready();
  const params = new URLSearchParams({ query, contextLength: String(contextLength) });
  const res = await request(conn, `/search/simple/?${params}`, {
    method: 'POST',
    accept: 'application/json',
  });
  const data = await res.json() as Array<{
    filename?: string;
    matches?: Array<{ context?: string }>;
  }>;
  return (Array.isArray(data) ? data : []).map(hit => ({
    path: hit.filename ?? '',
    context: hit.matches?.[0]?.context ?? '',
  })).filter(hit => hit.path);
}

export type SaveResult = 'ok' | 'conflict';

/** Re-reads the note; writes only if its content still matches `expectedSource`.
 *  Generalizes the re-read-then-write conflict check useObsidianDaily.ts's
 *  toggleTaskLine caller already uses, to a whole-body write. */
export async function saveNoteIfUnchanged(
  path: string, expectedSource: string, newSource: string,
): Promise<SaveResult> {
  const current = await getFile(path);
  if (current !== expectedSource) return 'conflict';
  await putFile(path, newSource);
  return 'ok';
}

/** Open a note in the Obsidian UI (focuses the Obsidian window). */
export async function openInObsidian(path: string): Promise<void> {
  const conn = await ready();
  await request(conn, `/open/${encodeVaultPath(path)}`, { method: 'POST' });
}

// ── Connection test ───────────────────────────────────────────────────────────

export type ConnectionTestResult =
  | { ok: true; version?: string }
  | { ok: false; code: ObsidianErrorCode };

/**
 * Two-step probe so "Obsidian isn't running" and "your API key is wrong" can
 * be told apart in the settings UI:
 *   1. `GET /` is the plugin's one unauthenticated endpoint — if it answers,
 *      the server is up.
 *   2. An authenticated call then proves the key is accepted.
 */
export async function testConnection(candidate: ObsidianConnection): Promise<ConnectionTestResult> {
  const conn: ObsidianConnection = {
    ...candidate,
    baseUrl: (candidate.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };

  if (!(await hasObsidianHostPermission())) return { ok: false, code: 'NO_PERMISSION' };
  if (!conn.apiKey) return { ok: false, code: 'NOT_CONFIGURED' };

  let version: string | undefined;
  try {
    const res = await request(conn, '/', { anonymous: true, accept: 'application/json' });
    const status = await res.json().catch(() => ({})) as { versions?: { self?: string } };
    version = status.versions?.self;
  } catch (err) {
    return { ok: false, code: err instanceof ObsidianError ? err.code : 'UNREACHABLE' };
  }

  try {
    // Listing the vault root is the cheapest call that requires the key.
    await request(conn, '/vault/', { accept: 'application/json' });
  } catch (err) {
    return { ok: false, code: err instanceof ObsidianError ? err.code : 'HTTP_ERROR' };
  }

  return { ok: true, version };
}
