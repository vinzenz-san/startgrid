// Runtime permission helpers for optional_permissions declared in the
// manifest (currently just "bookmarks" — see manifest.firefox.json /
// manifest.chrome.json). Mirrors the pattern already used for OAuth in
// googleAuth.ts/msAuth.ts: nothing is granted at install time, a widget
// requests it lazily the moment the user actually needs the feature.
//
// webextension-polyfill throws at *module evaluation time* (not just when
// its APIs are called) if no chrome/browser global exists — which is always
// the case in the plain-browser preview build (docs/preview, and the older
// preview-server.js dev workflow). A static top-level `import browser from
// 'webextension-polyfill'` would therefore crash the whole bundle before
// React even mounts, in any non-extension context. So detection below uses
// the raw `chrome` global directly (present only in extension pages),
// matching the pattern in storage.ts/storageLocal.ts, and the polyfill
// itself is only ever imported when that's true.
//
// The actual permission *request* still needs care: Firefox only honours
// browser.permissions.request() when called synchronously within a
// user-gesture call stack (a click handler) — even one `await` in between
// can lose that gesture context. So the dynamic import is pre-warmed as
// soon as we know we're in an extension (well before any click), and the
// click handler below awaits the already-cached promise and calls
// .request() with no further await in between.
const isExtensionEnvRaw = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

const browserPromise = isExtensionEnvRaw
  ? import('webextension-polyfill').then((m) => m.default)
  : null;

export const isExtensionEnv = isExtensionEnvRaw;

// ── Screenshot mode ──────────────────────────────────────────────────────────
//
// Dev-only override (Developer Options → DevPanel) for taking clean store/
// marketing screenshots without using real accounts, calendars, bookmarks, or
// vault data. Every widget that has a mock/demo data path (Calendar, Outlook
// Calendar/Mail, Bookmarks, Bookmark Search, the mock-gated Obsidian widgets)
// switches to it while this is on — including inside a real loaded extension,
// where those paths otherwise never trigger — with no "preview data" badge,
// so the screenshot doesn't advertise itself as fake. Persisted to plain
// localStorage since it's a local dev aid: never synced, and — because it
// only takes effect once Developer Options is deliberately enabled — never a
// risk of silently masking a real user's own data.
const SCREENSHOT_MODE_KEY = 'sg:screenshotMode';

export function isScreenshotMode(): boolean {
  try { return localStorage.getItem(SCREENSHOT_MODE_KEY) === '1'; } catch { return false; }
}

export function setScreenshotMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(SCREENSHOT_MODE_KEY, '1');
    else localStorage.removeItem(SCREENSHOT_MODE_KEY);
  } catch { /* ignore */ }
}

export async function hasBookmarksPermission(): Promise<boolean> {
  if (!browserPromise) return false;
  try {
    const browser = await browserPromise;
    return await browser.permissions.contains({ permissions: ['bookmarks'] });
  } catch {
    return false;
  }
}

// Must be invoked directly from a click handler — no await before this call
// once browserPromise has already resolved (it's pre-warmed above).
export function requestBookmarksPermission(): Promise<boolean> {
  if (!browserPromise) return Promise.resolve(false);
  return browserPromise
    .then((browser) => browser.permissions.request({ permissions: ['bookmarks'] }))
    .catch(() => false);
}

// ── Obsidian host permission ─────────────────────────────────────────────────
//
// The Obsidian widgets talk to the Local REST API plugin's server on the
// loopback interface. That needs a host permission, declared in both manifests
// under `optional_host_permissions` (a separate key — MV3 rejects host match
// patterns inside `optional_permissions`). Nothing is granted at install time;
// this is requested the first time a user connects a widget.
//
// Two things about the match pattern are easy to get wrong:
//   - Match patterns have no port component, so `http://127.0.0.1/*` already
//     covers the plugin's 27123 and cannot be narrowed to it.
//   - `localhost` and `127.0.0.1` are distinct patterns. We use 127.0.0.1
//     everywhere, manifest and request URLs alike — see lib/obsidianApi.ts.
export const OBSIDIAN_ORIGIN_PATTERN = 'http://127.0.0.1/*';

export async function hasObsidianHostPermission(): Promise<boolean> {
  if (!browserPromise) return false;
  try {
    const browser = await browserPromise;
    return await browser.permissions.contains({ origins: [OBSIDIAN_ORIGIN_PATTERN] });
  } catch {
    return false;
  }
}

// Same gesture constraint as requestBookmarksPermission above — call straight
// from a click handler, with no await in between.
export function requestObsidianHostPermission(): Promise<boolean> {
  if (!browserPromise) return Promise.resolve(false);
  return browserPromise
    .then((browser) => browser.permissions.request({ origins: [OBSIDIAN_ORIGIN_PATTERN] }))
    .catch(() => false);
}

export function removeObsidianHostPermission(): Promise<boolean> {
  if (!browserPromise) return Promise.resolve(false);
  return browserPromise
    .then((browser) => browser.permissions.remove({ origins: [OBSIDIAN_ORIGIN_PATTERN] }))
    .catch(() => false);
}
