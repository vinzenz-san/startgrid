const DANGEROUS_URL_SCHEME = /^(javascript|data):/i;
const HAS_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Normalizes a user-typed URL/host (e.g. "vinzenz-dev.de") into a full
 *  https:// URL, leaving an already-schemed URL untouched. Returns null for
 *  dangerous schemes (javascript:, data:) instead of normalizing them —
 *  callers should treat that as a rejected input, not silently drop it. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (DANGEROUS_URL_SCHEME.test(trimmed)) return null;
  return HAS_URL_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** True when `url` has a dangerous scheme (javascript:, data:) — a defensive
 *  render-time guard for links that may not have gone through normalizeUrl
 *  (e.g. restored from an older/unsanitized backup). */
export function isDangerousUrlScheme(url: string): boolean {
  return DANGEROUS_URL_SCHEME.test(url.trim());
}
