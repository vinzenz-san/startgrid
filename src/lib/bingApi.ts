// Pure network helper — fetches Bing's daily wallpaper via the community
// mirror at bing.npanuhin.me rather than Bing's own HPImageArchive.aspx
// endpoint. Bing's own endpoint doesn't send an
// Access-Control-Allow-Origin header, so a direct fetch() from an extension
// page is blocked by ordinary CORS regardless of host_permissions; the
// mirror sends `access-control-allow-origin: *`, so no background-script
// relay is needed at all.

const BING_ENDPOINT = 'https://bing.npanuhin.me/US/en.json';

export interface BingImageResult {
  url: string;
  title?: string;
}

interface BingMirrorEntry {
  title: string;
  date: string; // YYYY-MM-DD
  url: string;  // CORS-friendly mirrored image URL
}

function isBingMirrorEntry(v: unknown): v is BingMirrorEntry {
  if (v === null || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.date === 'string' && typeof e.url === 'string';
}

/** Fetches Bing's wallpaper for `date` via the community CORS mirror, falling back to the latest archived entry if that exact date isn't available. */
export async function fetchBingImageDirect(date?: string): Promise<BingImageResult> {
  const res = await fetch(BING_ENDPOINT);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const raw = await res.json() as unknown;
  if (!Array.isArray(raw)) throw new Error('Malformed Bing mirror response');
  const data = raw.filter(isBingMirrorEntry);
  // array is date-ascending; last = today's. A custom date falls back to the
  // latest entry if the mirror doesn't have that specific day archived.
  const entry = date ? data.find(e => e.date === date) ?? data[data.length - 1] : data[data.length - 1];
  if (!entry?.url) throw new Error('No image in Bing response');
  return {
    url: entry.url,
    title: entry.title,
  };
}
