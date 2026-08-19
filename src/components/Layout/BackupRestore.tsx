import { SETTINGS_DEFAULTS } from '../../contexts/SettingsContext';
import { isAllowedLinkUrl } from '../../lib/openLink';

// Backup / restore / factory-reset storage logic. Pure functions — SettingsPanel
// renders the Data Management UI and calls directly into these.

const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;

// OAuth tokens never leave the extension's sandboxed storage. An exported
// backup is a plain-text JSON file in the user's Downloads folder (often
// itself cloud-synced), so including sg_google_auth/sg_ms_auth would put a
// live refresh token on disk where any local process could read it — exactly
// the guarantee docs/privacy.html makes about browser.storage.local. Filtered
// on both ends: export never writes them, and import never restores them from
// a hand-edited or third-party file.
const SENSITIVE_LOCAL_KEYS = ['sg_google_auth', 'sg_ms_auth'];

function withoutSensitiveKeys(local: Record<string, unknown>): Record<string, unknown> {
  const filtered = { ...local };
  for (const key of SENSITIVE_LOCAL_KEYS) delete filtered[key];
  return filtered;
}

// ── Storage helpers ────────────────────────────────────────────────────────

async function readAllStorage(): Promise<{ sync: Record<string, unknown>; local: Record<string, unknown> }> {
  if (isExtension) {
    const { default: browser } = await import('webextension-polyfill');
    const [sync, local] = await Promise.all([
      browser.storage.sync.get(null),
      browser.storage.local.get(null),
    ]);
    return { sync, local };
  }
  // Dev fallback: collect localStorage keys by prefix
  const sync: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    const raw = localStorage.getItem(k)!;
    try {
      if (k.startsWith('sg:'))       sync[k.slice(3)]       = JSON.parse(raw);
      else if (k.startsWith('sg-local:')) local[k.slice(9)] = JSON.parse(raw);
    } catch { /* skip unparseable */ }
  }
  return { sync, local };
}

async function writeAllStorage(sync: Record<string, unknown>, local: Record<string, unknown>): Promise<void> {
  if (isExtension) {
    const { default: browser } = await import('webextension-polyfill');
    await Promise.all([
      browser.storage.sync.set(sync),
      browser.storage.local.set(local),
    ]);
    return;
  }
  Object.entries(sync).forEach(([k, v])  => localStorage.setItem(`sg:${k}`,       JSON.stringify(v)));
  Object.entries(local).forEach(([k, v]) => localStorage.setItem(`sg-local:${k}`, JSON.stringify(v)));
}

// Sweeps plain window.localStorage of every 'sg:'-prefixed key — the
// synchronous first-render "fast path" caches (BackgroundContext.tsx's
// background config/image-URL cache, DevPanel's saved position, Screenshot
// Mode) live here specifically because they need to be readable before
// browser.storage's async get() resolves, so they're deliberately outside
// browser.storage.sync/local entirely. In the non-extension dev build this
// is also where everything else lives (see the isExtension branch below),
// but even in a real extension it must run too — otherwise a stale
// background survives a factory reset because BackgroundContext seeds its
// initial state from this cache before ever reading the (now-cleared)
// browser.storage.
function clearLocalStorageFastPaths(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith('sg:') || k.startsWith('sg-local:')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

async function clearAllStorage(): Promise<void> {
  clearLocalStorageFastPaths();
  if (isExtension) {
    const { default: browser } = await import('webextension-polyfill');
    await Promise.all([
      browser.storage.sync.clear(),
      browser.storage.local.clear(),
    ]);
  }
}

// ── Factory reset ──────────────────────────────────────────────────────────

export async function performFactoryReset(developerOptionsEnabled: boolean): Promise<void> {
  await clearAllStorage();
  if (developerOptionsEnabled) {
    await writeAllStorage(
      { 'sg:settings': { ...SETTINGS_DEFAULTS, developerOptionsEnabled: true } },
      {},
    );
  }
  setTimeout(() => window.location.reload(), 50);
}

// ── Backup envelope ────────────────────────────────────────────────────────

interface BackupEnvelope {
  version: 1;
  exportedAt: string;
  sync: Record<string, unknown>;
  local: Record<string, unknown>;
}

const HAS_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ICON_KEY_PATTERN = /icon/i;

/** Recursively walks a parsed backup tree and throws on the first string
 *  value that looks like a URL (has an explicit scheme) but isn't safe to
 *  store/render later — icon fields get a `data:image/` carve-out (StartGrid
 *  itself writes uploaded-icon data URIs there), everything else must pass
 *  the same scheme allowlist used before ever opening a link (lib/openLink.ts). */
function assertNoDangerousUrls(value: unknown, keyHint?: string): void {
  if (typeof value === 'string') {
    if (!HAS_URL_SCHEME.test(value)) return;
    if (keyHint && ICON_KEY_PATTERN.test(keyHint) && value.startsWith('data:image/')) return;
    if (!isAllowedLinkUrl(value)) {
      throw new Error(`Backup contains a disallowed URL${keyHint ? ` in "${keyHint}"` : ''}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoDangerousUrls(item, keyHint);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoDangerousUrls(v, k);
  }
}

function isValidEnvelope(data: unknown): data is BackupEnvelope {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.version === 1 &&
    typeof d.exportedAt === 'string' &&
    d.sync !== null && typeof d.sync === 'object' && !Array.isArray(d.sync) &&
    d.local !== null && typeof d.local === 'object' && !Array.isArray(d.local)
  );
}

// ── Export ───────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const { sync, local } = await readAllStorage();
  const envelope: BackupEnvelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sync,
    local: withoutSensitiveKeys(local),
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `startpage-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ───────────────────────────────────────────────────────────────

export function importBackup(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result;
        if (typeof raw !== 'string') throw new Error('Could not read file.');
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidEnvelope(parsed)) {
          throw new Error('Invalid backup file. Expected a Startpage backup with version, sync, and local keys.');
        }
        assertNoDangerousUrls(parsed.sync);
        assertNoDangerousUrls(parsed.local);
        await writeAllStorage(parsed.sync, withoutSensitiveKeys(parsed.local));
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Unknown error.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file);
  });
}
