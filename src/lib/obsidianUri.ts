/**
 * Obsidian deep-link (`obsidian://`) helpers — the zero-permission transport.
 *
 * This path needs no host permission and no plugin on the Obsidian side: the
 * OS resolves the scheme and hands off to the installed Obsidian app. The
 * trade-off is that it is write/open only (nothing can be read back) and it
 * *focuses the Obsidian window*, which is why the REST transport in
 * lib/obsidianApi.ts is preferred for capture once a connection is configured.
 *
 * Launching deliberately avoids two approaches that don't survive contact with
 * the extension environment:
 *   - `window.open()` — treated as a popup and blocked when the call isn't
 *     inside a trusted gesture stack.
 *   - `browser.tabs.create()` — Chrome rejects non-http(s) schemes there.
 * A synthesised anchor click is what's left, and it's also what the browser
 * treats as a normal user-initiated external-protocol navigation.
 */

/** Obsidian's URI parser expects every component percent-encoded, including
 *  the characters `encodeURIComponent` leaves alone (`!'()*`). Note paths with
 *  parentheses — common enough in real vaults — break without this. */
function encodeStrict(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildUri(action: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
    .map(([key, value]) => `${key}=${encodeStrict(value)}`)
    .join('&');
  return `obsidian://${action}${query ? `?${query}` : ''}`;
}

/** Append `content` to `file`, creating it if it doesn't exist. */
export function buildAppendUri(vault: string, file: string, content: string): string {
  return buildUri('new', { vault, file, content, append: 'true' });
}

/** Open an existing note. */
export function buildOpenUri(vault: string, file: string): string {
  return buildUri('open', { vault, file });
}

/** Open the vault itself (no `file`) — Obsidian has no literal "index" page,
 *  so this is the closest equivalent: it focuses the app on whatever note
 *  was last open there, with the file explorer sidebar available to browse
 *  from. */
export function buildOpenVaultUri(vault: string): string {
  return buildUri('open', { vault });
}

/** Hand a URI to the OS handler. Safe to call outside a click handler. */
export function launchUri(uri: string): void {
  const a = document.createElement('a');
  a.href = uri;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
