// Proxies background-image providers whose API key must stay server-side.
// Path-routed: /nasa/* forwards to api.nasa.gov (api_key as a query param),
// /google-token forwards to Google's OAuth token endpoint (client_secret
// injected server-side — Google's "Web application" client type requires
// client_secret at token exchange even when the extension uses PKCE),
// /ms-token forwards to Microsoft's identity platform token endpoint (same
// reasoning — see src/lib/msAuth.ts), /rss forwards to whatever feed URL the
// caller passes via ?url= (most RSS/Atom feeds send no CORS headers, so the
// extension can't fetch them directly without host_permissions — see
// src/lib/rssApi.ts), /carto/* forwards to basemaps.cartocdn.com (key as a
// query param, see src/components/widgets/RainRadar/RainRadar.tsx — it has
// its own, much higher rate-limit bucket, see TILE_RATE_LIMIT_MAX below),
// everything else forwards to api.unsplash.com (Client-ID auth header) —
// keeps a single Worker/deploy for all of these rather than one per provider.
export interface Env {
  UNSPLASH_ACCESS_KEY: string;
  NASA_API_KEY: string;
  CARTO_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  // Comma-separated allowlist that replaces the built-in Chrome origin below,
  // e.g. 'chrome-extension://aaa...,chrome-extension://bbb...'. An entry may
  // end in '*' to match a prefix ('chrome-extension://*'). Firefox origins and
  // the web origins below are always allowed regardless of this value.
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT: KVNamespace;
}

// ── CORS origin allowlist ─────────────────────────────────────────────────────
//
// This cannot collapse to a single fixed origin: Firefox regenerates
// moz-extension://<uuid> per install and per profile, so the scheme is the
// only thing there is to match on. Chrome's ID is stable — it's pinned by
// startgrid-chrome-key.pub.b64.txt (see rspack.config.ts) — so it's matched
// exactly.
//
// Two Chrome origins, not one — they are NOT the same value:
//   * `build:chrome-store` omits the manifest key field, so the published item
//     uses the ID the Web Store assigned at listing creation. This is the ID
//     real users run; it must never be dropped from this list.
//   * `build:chrome` injects the pinned key (startgrid-chrome-key.pub.b64.txt),
//     which produces a different, local-only ID for unpacked testing.
// Deriving one from the other is not possible — confirmed 2026-07-29 by
// resolving both against the Web Store: only cihlhlnnd... returns the StartGrid
// listing. An earlier revision of this file allowed the unpacked ID alone,
// which 403'd every store install until this was caught.
//
// RELEASE CHECKLIST: before every deploy, verify cihlhlnnd... below still
// resolves to the live StartGrid Web Store listing
// (https://chromewebstore.google.com/detail/cihlhlnndcacidpnhmncifiggfcacdhk).
// The Web Store can reassign or change a listing's ID on things like a
// republish under new ownership or a policy-triggered relist — if that ever
// happens, real users get silently 403'd (as already occurred once, see
// above) until this constant is updated and the Worker is redeployed. No
// automated check for this exists; it must be done manually.
const CHROME_EXTENSION_ORIGINS = [
  'chrome-extension://cihlhlnndcacidpnhmncifiggfcacdhk', // Chrome Web Store listing
  'chrome-extension://jkikhgehaeponbomfggejlnpbegpdafl', // local unpacked (pinned key)
];
const FIREFOX_ORIGIN_PATTERN = /^moz-extension:\/\/[0-9a-f-]+$/i;
// Demo/testing surfaces served over the public web.
const WEB_ORIGINS = ['https://vinzenz-dev.de', 'http://localhost:5173'];

function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
}

function originMatches(origin: string, entry: string): boolean {
  return entry.endsWith('*') ? origin.startsWith(entry.slice(0, -1)) : origin === entry;
}

/**
 * Returns the value to echo back in Access-Control-Allow-Origin, or null if
 * the caller isn't allowed (including when no Origin header was sent at
 * all — see the rejection in fetch() below).
 *
 * This can never fully authenticate a caller: a non-browser client can forge
 * any Origin header it likes, so the allowlist only stops browsers acting on
 * behalf of an unrecognised page. It's paired with per-IP rate limiting
 * below, which is what actually bounds how much of the API keys this Worker
 * holds a single caller — forged origin or not — can spend.
 */
export function resolveAllowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  if (FIREFOX_ORIGIN_PATTERN.test(origin)) return origin;

  const configured = parseAllowlist(env.ALLOWED_ORIGIN);
  const allowed = [
    ...(configured.length > 0 ? configured : CHROME_EXTENSION_ORIGINS),
    ...WEB_ORIGINS,
  ];
  return allowed.some(entry => originMatches(origin, entry)) ? origin : null;
}

// Fixed-window rate limit: requests allowed per IP per RATE_LIMIT_WINDOW_SECONDS.
// Set to 5 only while manually verifying the 429 path, then restored to 60.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// CARTO base-map tiles get their own, much higher bucket: a single map
// pan/zoom in the Rain Radar widget easily fires 15-30 tile requests at
// once (Leaflet's keepBuffer prefetches beyond the viewport, and a zoom
// level change reloads the whole visible set) — sharing the 60/min bucket
// above would 429 the map into blank tiles after one or two interactions,
// and burn the same widget's/other widgets' shared NASA/Unsplash budget
// for the rest of the minute besides.
const TILE_RATE_LIMIT_MAX = 300;

async function checkRateLimit(ip: string, env: Env, bucket = 'rl'): Promise<boolean> {
  const key = `${bucket}:${ip}`;
  const max = bucket === 'rl' ? RATE_LIMIT_MAX : TILE_RATE_LIMIT_MAX;
  const current = Number((await env.RATE_LIMIT.get(key)) ?? '0');
  if (current >= max) return false;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return true;
}

const UNSPLASH_UPSTREAM = 'https://api.unsplash.com';
const NASA_UPSTREAM = 'https://api.nasa.gov';
const NASA_PREFIX = '/nasa';
const GOOGLE_TOKEN_UPSTREAM = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_PATH = '/google-token';
const MS_TOKEN_UPSTREAM = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_TOKEN_PATH = '/ms-token';
const RSS_PATH = '/rss';
const CARTO_UPSTREAM = 'https://basemaps.cartocdn.com';
const CARTO_PREFIX = '/carto';

async function relay(upstreamRes: Response, corsHeaders: Record<string, string>): Promise<Response> {
  const body = await upstreamRes.arrayBuffer();
  return new Response(body, {
    status: upstreamRes.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstreamRes.headers.get('Content-Type') || 'application/json',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isCartoPath = url.pathname.startsWith(CARTO_PREFIX);
    const origin = request.headers.get('Origin');
    const allowedOrigin = resolveAllowedOrigin(origin, env);

    // Refuse outright rather than relying on the browser to throw the
    // response away, so the keys behind this Worker can't be spent from an
    // unknown page — or, now, from a request that skips Origin entirely.
    //
    // /carto/* is exempt: Leaflet loads tiles as plain <img> elements, and
    // confirmed live in Firefox, a cross-site no-cors image load from a
    // moz-extension: page sends neither Origin nor Referer (Sec-Fetch-Site:
    // cross-site, Sec-Fetch-Storage-Access: none) — origin-gating this path
    // would permanently 403 every tile. There's no reliable per-caller signal
    // available for an <img>-initiated request, so TILE_RATE_LIMIT_MAX below
    // is this path's actual abuse control instead of origin-checking.
    if (allowedOrigin === null && !isCartoPath) {
      return new Response(`Origin not allowed: ${origin ?? '(none)'}`, { status: 403 });
    }

    // Vary matters here: without it a cache could serve one extension install's
    // Allow-Origin header to another.
    const corsHeaders: Record<string, string> = allowedOrigin
      ? {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          Vary: 'Origin',
        }
      : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const bucket = isCartoPath ? 'rl:carto' : 'rl';
    if (!(await checkRateLimit(ip, env, bucket))) {
      return new Response('Rate limit exceeded', { status: 429, headers: corsHeaders });
    }

    if (url.pathname === GOOGLE_TOKEN_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      const incoming = await request.formData();
      const params = new URLSearchParams();
      for (const [key, value] of incoming.entries()) {
        params.set(key, String(value));
      }
      params.set('client_id', env.GOOGLE_CLIENT_ID);
      params.set('client_secret', env.GOOGLE_CLIENT_SECRET);

      const upstreamRes = await fetch(GOOGLE_TOKEN_UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      return relay(upstreamRes, corsHeaders);
    }

    if (url.pathname === MS_TOKEN_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      const incoming = await request.formData();
      const params = new URLSearchParams();
      for (const [key, value] of incoming.entries()) {
        params.set(key, String(value));
      }
      params.set('client_id', env.MS_CLIENT_ID);
      params.set('client_secret', env.MS_CLIENT_SECRET);

      const upstreamRes = await fetch(MS_TOKEN_UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      return relay(upstreamRes, corsHeaders);
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (url.pathname === RSS_PATH) {
      const feedUrl = url.searchParams.get('url');
      // http(s)-only: without this, the ?url= param would make this Worker a
      // generic open proxy for arbitrary schemes/hosts (file:, internal IPs
      // Cloudflare's network can reach, etc.), not just RSS/Atom feeds.
      if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
        return new Response('Missing or invalid url parameter', { status: 400, headers: corsHeaders });
      }
      const upstreamRes = await fetch(feedUrl);
      return relay(upstreamRes, corsHeaders);
    }

    if (url.pathname.startsWith(NASA_PREFIX)) {
      const nasaPath = url.pathname.slice(NASA_PREFIX.length) || '/';
      const params = new URLSearchParams(url.search);
      params.set('api_key', env.NASA_API_KEY);
      const upstreamRes = await fetch(`${NASA_UPSTREAM}${nasaPath}?${params}`);
      return relay(upstreamRes, corsHeaders);
    }

    if (url.pathname.startsWith(CARTO_PREFIX)) {
      // No {s} subdomain round-robin here — that was only ever to spread load
      // across browser per-host connection limits on the client; a single
      // Worker origin doesn't have that constraint.
      const cartoPath = url.pathname.slice(CARTO_PREFIX.length) || '/';
      const upstreamRes = await fetch(`${CARTO_UPSTREAM}${cartoPath}?key=${env.CARTO_API_KEY}`);
      return relay(upstreamRes, corsHeaders);
    }

    const upstreamRes = await fetch(`${UNSPLASH_UPSTREAM}${url.pathname}${url.search}`, {
      headers: {
        Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1',
      },
    });
    return relay(upstreamRes, corsHeaders);
  },
};
