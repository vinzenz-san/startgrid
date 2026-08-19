import { MEDIA_PROXY_URL } from './mediaProxy';

// NASA APOD API. When APP_MEDIA_PROXY_URL is set (see .env.example), requests
// go through the Cloudflare Worker in worker/api-proxy.ts, which attaches the
// real key server-side. Without a proxy configured (e.g. local dev on a fresh
// clone), falls back to calling NASA directly with APP_NASA_API_KEY, or NASA's
// heavily rate-limited DEMO_KEY (30 req/hr, 50/day) if that's unset either —
// with a console notice.
//
// The fallback below is why rspack.config.ts injects APP_NASA_API_KEY only
// when no proxy URL is configured: MEDIA_PROXY_URL is derived through a
// .replace() call, so the minifier can't fold it to a constant, can't prove
// this branch dead, and would otherwise keep the key as a string literal in
// every shipped bundle.
const NASA_API_KEY = import.meta.env.APP_NASA_API_KEY || '';

let APOD_BASE: string;
if (MEDIA_PROXY_URL) {
  APOD_BASE = `${MEDIA_PROXY_URL}/nasa/planetary/apod`;
} else {
  if (!NASA_API_KEY) {
    console.info('[astronomy] Neither APP_MEDIA_PROXY_URL nor APP_NASA_API_KEY set — falling back to NASA\'s heavily rate-limited DEMO_KEY. See .env.example.');
  }
  APOD_BASE = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY || 'DEMO_KEY'}`;
}

export interface ApodImageResult {
  url: string;
  title?: string;
  copyright?: string;
}

interface ApodResponse {
  media_type: string;
  url: string;
  hdurl?: string;
  title?: string;
  copyright?: string;
}

// Pure network helper — same shape as fetchBingImageDirect in lib/bingApi.ts.
// Returns null when the requested APOD isn't an image (e.g. a video), so
// callers know to fall back to FALLBACK_CSS instead of treating it as an error.
// Pass a YYYY-MM-DD `date` to fetch a specific day's APOD instead of today's.
export async function fetchApodImage(date?: string): Promise<ApodImageResult | null> {
  const joiner = APOD_BASE.includes('?') ? '&' : '?';
  const endpoint = date ? `${APOD_BASE}${joiner}date=${date}` : APOD_BASE;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as ApodResponse;
  if (data.media_type !== 'image') return null;
  const imageUrl = data.hdurl || data.url;
  if (!imageUrl) throw new Error('No image in APOD response');
  return { url: imageUrl, title: data.title, copyright: data.copyright };
}
