// Shared PKCE/OAuth authorization-code-flow core used by googleAuth.ts and
// msAuth.ts. Provider-specific constants, setup instructions, and anything
// with no equivalent on the other side (Google's /revoke call) stay in the
// provider files; this module holds only what both flows do identically.

export interface StoredAuthBase {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;  // ms since epoch; callers subtract 60s for clock-skew safety
  email?: string;      // decoded from id_token for display only
}

export interface ProviderConfig {
  storageKey: string;
  authEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scopes: string[];
  // Extra query params merged into the /authorize URL, e.g. Google's
  // access_type=offline&prompt=consent or MS's prompt=select_account&response_mode=query.
  extraAuthParams?: Record<string, string>;
  // MS's refresh_token request includes `scope`; Google's doesn't.
  includeScopeInRefresh: boolean;
  // MS's id_token sometimes carries the email under this claim instead of `email`.
  emailFallbackClaim?: string;
}

// ── PKCE helpers (Web Crypto — always available in extension pages) ────────────

/** Base64url-encodes bytes (no padding, `+`/`/` swapped for `-`/`_`) per RFC 7636. */
export function base64urlEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeVerifier(): Promise<string> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return base64urlEncode(raw);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(digest));
}

// Decode the email claim from a JWT id_token without verifying the signature.
// We trust the provider's HTTPS delivery here; this is display-only.
function extractEmailFromIdToken(idToken: string, fallbackClaim?: string): string | undefined {
  try {
    const payload = idToken.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json.email === 'string') return json.email;
    if (fallbackClaim && typeof json[fallbackClaim] === 'string') return json[fallbackClaim];
    return undefined;
  } catch {
    return undefined;
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getBrowser() {
  const { default: browser } = await import('webextension-polyfill');
  return browser;
}

async function readStoredAuth<T extends StoredAuthBase>(storageKey: string): Promise<T | null> {
  const browser = await getBrowser();
  const result  = await browser.storage.local.get(storageKey);
  return (result[storageKey] as T) ?? null;
}

async function writeStoredAuth<T extends StoredAuthBase>(storageKey: string, auth: T): Promise<void> {
  const browser = await getBrowser();
  await browser.storage.local.set({ [storageKey]: auth });
}

async function clearStoredAuth(storageKey: string): Promise<void> {
  const browser = await getBrowser();
  await browser.storage.local.remove(storageKey);
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken<T extends StoredAuthBase>(
  stored: T,
  config: ProviderConfig,
): Promise<T | null> {
  if (!stored.refreshToken) {
    // Implicit flow or a provider that never issued one — clear storage so
    // the widget shows the "Connect" prompt and the user can re-authenticate.
    await clearStoredAuth(config.storageKey);
    return null;
  }

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: stored.refreshToken,
    client_id:     config.clientId,
  });
  if (config.includeScopeInRefresh) {
    body.set('scope', config.scopes.join(' '));
  }

  const res = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    await clearStoredAuth(config.storageKey);
    return null;
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const updated = {
    ...stored,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? stored.refreshToken,
    expiresAt:    Date.now() + data.expires_in * 1000 - 60_000,
  } as T;

  await writeStoredAuth(config.storageKey, updated);
  return updated;
}

// ── Public generic API ──────────────────────────────────────────────────────────

/** True if any auth (possibly expired) is stored for this provider config. */
export async function checkIsConnectedGeneric(config: ProviderConfig): Promise<boolean> {
  const stored = await readStoredAuth(config.storageKey);
  return stored !== null;
}

/** Returns a valid access token, silently refreshing via `refreshAccessToken` if expired; `null` if unauthenticated or the refresh fails. */
export async function getValidTokenGeneric<T extends StoredAuthBase>(
  config: ProviderConfig,
): Promise<string | null> {
  const stored = await readStoredAuth<T>(config.storageKey);
  if (!stored) return null;

  if (Date.now() < stored.expiresAt) return stored.accessToken;

  const refreshed = await refreshAccessToken(stored, config);
  return refreshed?.accessToken ?? null;
}

/** Returns the display email decoded from the stored id_token, if any. */
export async function getConnectedEmailGeneric(config: ProviderConfig): Promise<string | undefined> {
  const stored = await readStoredAuth(config.storageKey);
  return stored?.email;
}

/** Raw stored auth record for this provider, or `null` if never authenticated. */
export async function readStoredAuthGeneric<T extends StoredAuthBase>(
  config: ProviderConfig,
): Promise<T | null> {
  return readStoredAuth<T>(config.storageKey);
}

/** Clears the stored auth record — client-side sign-out only. */
export async function clearStoredAuthGeneric(config: ProviderConfig): Promise<void> {
  await clearStoredAuth(config.storageKey);
}

/**
 * Launches the authorization-code + PKCE flow in a popup window for the
 * given provider config. Stores the resulting tokens and returns the access
 * token. Throws if the user cancels or if any step fails.
 */
export async function runAuthCodeFlow<T extends StoredAuthBase>(
  config: ProviderConfig,
  providerLabel: string,
): Promise<string> {
  const browser     = await getBrowser();
  const redirectUrl = browser.identity.getRedirectURL();
  // CSRF state — verified after redirect
  const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));

  const codeVerifier  = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = new URL(config.authEndpoint);
  authUrl.searchParams.set('client_id',             config.clientId);
  authUrl.searchParams.set('redirect_uri',          redirectUrl);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('scope',                 config.scopes.join(' '));
  authUrl.searchParams.set('state',                 state);
  authUrl.searchParams.set('code_challenge',        codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  for (const [key, value] of Object.entries(config.extraAuthParams ?? {})) {
    authUrl.searchParams.set(key, value);
  }

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url:         authUrl.toString(),
    interactive: true,
  });

  const query         = new URL(responseUrl).searchParams;
  const code          = query.get('code');
  const returnedState = query.get('state');
  const error         = query.get('error');

  if (error)                   throw new Error(`${providerLabel} auth error: ${error}`);
  if (!code)                   throw new Error('No authorization code in redirect response');
  if (returnedState !== state) throw new Error('OAuth state mismatch — possible CSRF attack');

  const tokenRes = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     config.clientId,
      redirect_uri:  redirectUrl,
      code_verifier: codeVerifier,
      ...(config.includeScopeInRefresh ? { scope: config.scopes.join(' ') } : {}),
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const data = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  const auth = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000 - 60_000,
    email:        data.id_token ? extractEmailFromIdToken(data.id_token, config.emailFallbackClaim) : undefined,
  } as T;

  await writeStoredAuth(config.storageKey, auth);
  return auth.accessToken;
}
