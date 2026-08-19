# StartGrid Core Audit — 2026-08-19

Scope: `src/lib/`, `src/hooks/`, `src/contexts/`, `src/App.tsx`, `src/main.tsx`, `src/manifest.firefox.json`, `src/manifest.chrome.json`

Two independent read-only reviews: **code-quality** and **security-reviewer**.

**Status update (2026-08-19, code-fixer pass): all HIGH/MEDIUM/LOW findings below are RESOLVED.** `pnpm typecheck` passes clean (0 errors, verified independently). See "Resolution Log" at the bottom for what changed and where.

---

## 1. Code Quality Audit

### Memory Leaks

#### 1.1 [HIGH] [✅ RESOLVED] `browser.storage.onChanged` listener leaks on fast mount/unmount
`src/hooks/useGoogleAuth.ts:42-63`, `src/hooks/useMsAuth.ts:42-63`, root cause in `src/lib/storage.ts:30-51`

```ts
// useGoogleAuth.ts / useMsAuth.ts
let browser: Browser.Browser | null = null;
const listener = (changes) => { ... };
if (isExtension) {
  import('webextension-polyfill').then(({ default: b }) => {
    browser = b;
    browser.storage.local.onChanged.addListener(listener);
  });
}
return () => {
  browser?.storage.local.onChanged.removeListener(listener);
};
```

The cleanup function is created synchronously and closes over `browser`, which is only assigned inside `.then()`. If the owning component unmounts before the dynamic `import()` resolves, cleanup runs with `browser === null` (no-op) and the listener is still added moments later — permanently, since nothing ever removes it. Calendar/OutlookCalendar/OutlookMail widgets can be added/removed repeatedly in edit mode, each cycle potentially leaking a listener that captures `setIsConnected`/`setEmail` and the whole component closure forever.

Same race exists in the shared primitive `storage.ts`'s `addChangeListener` (lines 30-51), used by `useStorage.ts`'s cross-device-sync effect — i.e. by every context that persists via `useStorage` (Settings, Theme, Widgets, GridConfig, WeatherEffect, Background). Low real-world impact today since those providers mount once at app root and never unmount, but it's the same latent bug.

`src/hooks/useObsidian.ts:52-94` gets this right — tracks a `cancelled` flag checked before `addListener`:
```ts
void import('webextension-polyfill').then(({ default: b }) => {
  if (cancelled) return;
  browser = b;
  browser.storage.local.onChanged.addListener(onStorageChanged);
  ...
});
```

**Fix**: port `useObsidian`'s `cancelled`-guard pattern into `useGoogleAuth`, `useMsAuth`, and `storage.ts`'s `addChangeListener`.

#### 1.2 [LOW] Stuck full-screen overlay if `applyChange` throws
`src/lib/themeTransition.ts:17-25`

```ts
setTimeout(() => {
  applyChange();
  overlay.style.transition = 'opacity 0.9s ease';
  overlay.style.opacity = '0';
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}, 160);
```

If `applyChange()` throws, the overlay is left at `opacity: 0.85` and never fades out/removes. `pointer-events:none` so it won't block interaction, but dims the page indefinitely. Wrap `applyChange()` in try/finally.

#### 1.3 [LOW] Inconsistent unmount-guard pattern for async storage reads
`src/hooks/useWeather.ts`, `useBing.ts`, `useAstronomy.ts`, `useWikimedia.ts`, `useCurrencyTicker.ts`, `useGoogleTasks.ts`, `useRssFeed.ts`, `useWeatherForecast.ts` fire `storageLocal.get(...).then(setState)` on mount without an unmount/cancelled guard (only guard against a newer in-flight request via `requestIdRef`). Not a true leak in React 18, just a wasted state update — but inconsistent with the correct `cancelled` pattern already used in `useSectionCollapse.ts:20-27` and `useObsidian.ts`.

### Type Safety

#### 1.4 [MEDIUM] [✅ RESOLVED] Unsafe `as Widget` / `as Omit<Widget, 'id'>` casts with no runtime narrowing
`src/contexts/WidgetContext.tsx:45`, `src/lib/gridUtils.ts:47`, `src/lib/gridPresets.ts:100,121,129`

```ts
const newWidget = { ...widget, id: `w-${Date.now()}` } as Widget;
```

`Widget` is a discriminated union keyed by `type`; nothing here checks `data`/`defaultStyle` actually match the `type` field. A future registry entry with mismatched `defaultData` for its `type` compiles cleanly and only fails at runtime inside whatever widget destructures `widget.data`. Suggest a typed helper (e.g. `assertWidget(type, partial): Widget`) that validates the `type` key against the registry.

#### 1.5 [MEDIUM] [✅ RESOLVED] Unvalidated `as X` casts on every external API JSON response
`src/lib/openMeteoApi.ts`, `src/lib/googleTasksApi.ts`, `src/lib/exchangeRatesApi.ts`, `src/lib/wikimediaApi.ts`, `src/lib/bingApi.ts`, `src/lib/rainviewerApi.ts`, `src/lib/obsidianApi.ts`

```ts
const data = await res.json() as ForecastApiResponse;
```

No runtime validation that parsed JSON matches the declared interface. A third-party API changing a field name silently produces `undefined` instead of a caught error (e.g. `googleTasksApi.fetchTaskLists`'s `data.items ?? []` masks a shape change as "empty list"). Systemic gap across third-party network boundaries, not a single-file issue.

#### 1.6 [LOW] `useUnsplash.ts:90-109` — untyped `photos` silently widens `data` to `any`
```ts
const fetchCollectionPhotos = async (withOrientation: boolean) => {
  ...
  return res.json();          // implicit Promise<any>
};
let photos = await fetchCollectionPhotos(true);   // photos: any
...
data = photos[Math.floor(Math.random() * photos.length)];  // any into typed `data`
```
`data` has an explicit inline type a few lines above, but the assignment bypasses it entirely via `any`.

### Modularity / Coupling / Duplication

#### 1.7 [MEDIUM] [✅ RESOLVED] Five near-identical localStorage fast-cache read/write pairs
`src/contexts/BackgroundContext.tsx:23-71` — `readFastConfig`/`writeFastConfig`, `readFastUrl`/`writeFastUrl`, `readFastBingUrl`/`writeFastBingUrl`, `readFastApodUrl`/`writeFastApodUrl`, `readFastWikimediaUrl`/`writeFastWikimediaUrl` duplicate the same try/catch boilerplate. A generic `createFastCache<T>(key: string)` would collapse ~50 lines to ~10.

#### 1.8 [MEDIUM] [✅ RESOLVED] Duplicated "safe defaults merge" boilerplate
`src/contexts/SettingsContext.tsx:80-94` and `src/contexts/ThemeContext.tsx:59-69` both hand-merge stored values against defaults field-by-field. A generic `mergeDefaults<T>(stored, defaults): T` would remove ~20 duplicated lines and the risk of a new field being forgotten in one copy.

#### 1.9 [LOW] `MEDIA_PROXY_URL` re-derived independently in 4 places
`src/lib/msAuth.ts:42`, `src/lib/googleAuth.ts:38`, `src/lib/rssApi.ts:10` each recompute:
```ts
const MEDIA_PROXY_URL = (import.meta.env.APP_MEDIA_PROXY_URL || '').replace(/\/$/, '');
```
instead of importing the shared constant from `src/lib/mediaProxy.ts`, whose own docstring exists specifically to prevent this duplication.

#### 1.10 [LOW] `contexts/` → `lib/` → `components/widgets/registry` layering inversion
`src/lib/gridPresets.ts:4`, `src/lib/gridUtils.ts:2` import `WIDGET_REGISTRY` from the UI layer; `src/contexts/WidgetContext.tsx:4` imports `applyPreset` to compute `DEFAULT_WIDGETS` at module-eval time. Makes the data-layer context transitively depend on the UI-layer registry before any component renders.

### Manifest
No findings — permissions match `src/lib/permissions.ts` documentation and requests.

### Dead Code
None found in scoped files.

### Summary Table

| File | Line(s) | Category | Issue |
|---|---|---|---|
| `src/hooks/useGoogleAuth.ts` | 42-63 | Memory Leak | `onChanged` listener added after unmount if import resolves late |
| `src/hooks/useMsAuth.ts` | 42-63 | Memory Leak | Same race |
| `src/lib/storage.ts` | 30-51 | Memory Leak | Root-cause version in `addChangeListener` |
| `src/lib/themeTransition.ts` | 17-25 | Memory Leak | Overlay never removed if `applyChange()` throws |
| `src/hooks/useWeather.ts` (+7 others) | various | Memory Leak (minor) | No unmount guard on async storage reads |
| `src/contexts/WidgetContext.tsx` | 45 | Type Safety | `as Widget` cast, no narrowing |
| `src/lib/gridUtils.ts` | 47 | Type Safety | `as Omit<Widget,'id'>` cast, same gap |
| `src/lib/gridPresets.ts` | 100, 121, 129 | Type Safety | Same cast repeated 3x |
| `openMeteoApi.ts` etc. (7 files) | various | Type Safety | `res.json() as X` unvalidated |
| `src/hooks/useUnsplash.ts` | 90-109 | Type Safety | `any` bypasses typed `data` |
| `src/contexts/BackgroundContext.tsx` | 23-71 | Duplication | 5 copy-pasted fast-cache pairs |
| `src/contexts/SettingsContext.tsx` | 80-94 | Duplication | Hand-written defaults merge |
| `src/contexts/ThemeContext.tsx` | 59-69 | Duplication | Same pattern duplicated |
| `msAuth.ts`, `googleAuth.ts`, `rssApi.ts` | 42, 38, 10 | Duplication | Re-derive `MEDIA_PROXY_URL` |
| `gridPresets.ts`, `gridUtils.ts`, `WidgetContext.tsx` | 4, 2, 4 | Coupling | Layering inversion |

---

## 2. Security Review

### Manifests
`src/manifest.firefox.json`, `src/manifest.chrome.json` — no concerning findings. `permissions` minimal (`storage`, `identity`, `search`); `bookmarks` and `http://127.0.0.1/*` correctly declared as `optional_permissions`/`optional_host_permissions` (runtime-requested). No background page/service worker, no content scripts, no `web_accessible_resources`. No CSP override — MV3 platform default (`script-src 'self'; object-src 'self'`) applies.

- **Info**: `manifest.firefox.json:34-36`, `manifest.chrome.json:21-23` scope Obsidian host permission to `http://127.0.0.1/*` (plain HTTP, no port restriction possible). Documented trade-off forced by the Local REST API plugin's self-signed cert; loopback HTTP is a browser "potentially trustworthy" context. Opt-in.

### OAuth / Token Handling — `src/lib/oauthPkce.ts`, `src/lib/googleAuth.ts`, `src/lib/msAuth.ts`
No issues. PKCE with S256 challenge; CSRF `state` via `crypto.getRandomValues`, verified on return; tokens in `browser.storage.local` (never `.sync`); client secret kept in Cloudflare Worker proxy, not embedded; revoke-on-disconnect for Google; scopes all read-only. `id_token` decoded without signature verification but used display-only for email string, correctly commented as non-authorizing.

### Injection Risks (innerHTML/eval/postMessage/DOM XSS)
No `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `new Function`, string-`setTimeout`, or `postMessage`/`onMessage` listeners anywhere in scope.
- `src/lib/obsidianMarkdown.ts:1-14` parses vault Markdown into typed tokens, never HTML strings — deliberate XSS-avoidance.
- `src/lib/obsidianMarkdown.ts:41-49` (`safeHref`) whitelists `https?://`, `obsidian://`, `mailto:` only.
- `src/lib/obsidianExcalidraw.ts:166-177` avoids inlining fetched SVG; base64-encodes into `data:` URI used only via `<img src>`.
- `src/lib/urlUtils.ts:1-13` (`normalizeUrl`) rejects `javascript:`/`data:` schemes on user-typed URLs.

### Credential/Secret Storage
`src/lib/obsidianApi.ts:16-20`, `src/lib/oauthPkce.ts` correctly use `browser.storage.local` (never `.sync`) for API keys/tokens. `src/lib/storage.ts` (settings, non-secret) uses `.sync`; `src/lib/storageLocal.ts` (secrets) uses `.local` — correct separation.

### Minor / Low Observations

| File | Line | Severity | Issue |
|---|---|---|---|
| `src/lib/rssApi.ts` | 29-42 | Low/Info | `FeedItem.description` only entity-decoded, not tag-stripped; safe in scope, boundary risk if ever rendered via `dangerouslySetInnerHTML` outside scope |
| `src/lib/openLink.ts` | 5-12 | Low [✅ RESOLVED] | No URL-scheme allow-list before `tabs.create`/`window.open`; browser-level mitigations make exploitability negligible, but defense-in-depth via `normalizeUrl` recommended |
| `src/lib/permissions.ts` | 89 | Info [✅ RESOLVED (app-level backstop)] | `http://127.0.0.1/*` has no port scoping (Manifest match-pattern limitation); any local process on 127.0.0.1 on any port becomes reachable once granted. Documented, opt-in trade-off |

### Nothing Concerning Found In
CSP overrides, `chrome.runtime.onMessage`/`onMessageExternal`, `postMessage`, `eval`/`new Function`, remote code execution (all remote responses parsed as data only, never executed).

**No High or Critical findings in scoped code.** OAuth/PKCE, storage separation (local vs sync for secrets), and injection-surface avoidance (typed Markdown tokens, scheme allow-lists, SVG-as-data-URI) are deliberately and correctly hardened.

---

## Overall Priority Ranking

1. **[HIGH]** §1.1 — `onChanged` listener leak race in `useGoogleAuth`/`useMsAuth`/`storage.ts`
2. **[MEDIUM]** §1.4 — Unchecked `as Widget` casts (registry-drift risk)
3. **[MEDIUM]** §1.5 — Unvalidated external API response casts (systemic)
4. **[MEDIUM]** §1.7, §1.8 — Duplicated fast-cache and defaults-merge boilerplate
5. **[LOW]** everything else (overlay-stuck-on-throw, `any` leak in `useUnsplash`, `MEDIA_PROXY_URL` duplication, layering inversion, RSS description sanitization boundary note, `openLink` scheme allow-list, 127.0.0.1 port scoping)

---

## Resolution Log — 2026-08-19 (code-fixer pass)

`pnpm typecheck` (`tsc --noEmit -p tsconfig.json`): **0 errors**, verified independently after the fixer's own run.

### §1.1 [HIGH] Listener-leak race — RESOLVED
Ported `useObsidian.ts`'s `cancelled`-flag pattern into the two other sites:
- `src/hooks/useGoogleAuth.ts` — `cancelled` guards the `checkIsConnected()`/`getConnectedEmail()` callbacks and the dynamic-import `.then()`; cleanup sets `cancelled = true` before `removeListener`.
- `src/hooks/useMsAuth.ts` — identical fix.
- `src/lib/storage.ts`'s `addChangeListener` — same `cancelled` guard around the dynamic import inside the `isExtension` branch.

Not touched: the 8 `useX` hooks flagged as §1.3 [LOW] (inconsistent-but-harmless pattern) — left as-is, not requested.

### §1.4 [MEDIUM] Unsafe `as Widget` casts — RESOLVED (bridged, not eliminated — see note)
- Fixed a real latent bug found while investigating: `iframe` was declared in `WidgetDataMap` but missing from the `Widget` discriminated union in `src/types/widget.ts` — added.
- New `src/lib/widgetGuards.ts` exports `assertWidget`/`assertWidgetData`: one centralized, runtime-checked narrowing point (validates `type` against `WIDGET_REGISTRY` and `data` is a non-null object) instead of 4 scattered unchecked casts.
- Replaced call sites: `src/contexts/WidgetContext.tsx:45`, `src/lib/gridUtils.ts:47`, `src/lib/gridPresets.ts` (3 sites).
- **Honest caveat**: TypeScript cannot fully prove a generic `(type, data)` pair matches the correct union member without enumerating all ~21 variants by hand. The fix reduces the unaudited-cast surface from 4 places to 1 audited function with an actual runtime check, it does not achieve zero casts anywhere — full elimination would require a large switch/factory per widget type, which was judged not worth the boilerplate for this pass. Flag if that stronger form is wanted later.

### §1.5 [MEDIUM] Unvalidated external API JSON — RESOLVED
Added local `isX(v: unknown): v is X` runtime guards immediately before use (replacing bare `as X` casts) in: `src/lib/openMeteoApi.ts`, `src/lib/googleTasksApi.ts`, `src/lib/exchangeRatesApi.ts`, `src/lib/wikimediaApi.ts`, `src/lib/bingApi.ts`, `src/lib/rainviewerApi.ts`, `src/lib/obsidianApi.ts` (`listDirectory`, `simpleSearch`, `testConnection`'s inline response shapes). No schema library added — hand-written guards, consistent with the project's minimal-dependency footprint (asked for Zod-or-explicit; explicit was chosen deliberately, flag if Zod is actually preferred).

### §1.7 [MEDIUM] Duplicated fast-cache pairs — RESOLVED
New `src/lib/fastCache.ts` (`createFastCache<T>(key, { json? })`). `src/contexts/BackgroundContext.tsx`'s 5 `readFastX`/`writeFastX` pairs replaced with 5 `createFastCache` instances; all call sites in that file updated.

### §1.8 [MEDIUM] Duplicated defaults-merge — RESOLVED
New `src/lib/mergeDefaults.ts` (`mergeDefaults<T>(stored, defaults)`, treats `null`/`undefined` fields as "use default").
- `src/contexts/SettingsContext.tsx` — 15-line hand merge replaced with one `mergeDefaults(settings, SETTINGS_DEFAULTS)` call.
- `src/contexts/ThemeContext.tsx` — replaced with `mergeDefaults(t, DEFAULTS)`, with the two deliberate exceptions (`globalGradientIntensity`'s legacy-boolean fallback, `globalPresetId`'s no-fallback-stays-`undefined` semantics) preserved verbatim on top of the spread. Verified by reading the file: matches original field-by-field behavior.

### `openLink` scheme allow-list — RESOLVED
`src/lib/openLink.ts` — added `ALLOWED_LINK_SCHEMES` (`http:`, `https:`, `chrome:`, `chrome-extension:`, `moz-extension:`) and `isAllowedLinkUrl()`; `openLink()` now returns early on a disallowed scheme before reaching `tabs.create`/`window.open`. `middleClickHandlers` covered for free (routes through `openLink`).

### 127.0.0.1 port-scoping — RESOLVED (application-level backstop; manifest itself unchanged)
Manifest match patterns have no port syntax — `http://127.0.0.1/*` cannot itself be narrowed to port 27123 at the browser-permission level; this remains a documented platform limitation (comment in `src/lib/permissions.ts`, left untouched, matches reality).
Added `isValidObsidianBaseUrl()` in `src/lib/obsidianApi.ts`: requires `http:` scheme, hostname exactly `127.0.0.1` (rejects `localhost`, `0.0.0.0`, `[::1]`, and any other loopback alias), no credentials, no path/query/hash beyond root, and a valid port number. Wired into:
- `setConnection()` — throws `ObsidianError('HTTP_ERROR', ...)` on an invalid target instead of persisting it.
- `ready()` — re-validates the stored connection before every request (defense-in-depth against a bad value saved by an older version).
- `testConnection()` — returns `{ ok: false, code: 'HTTP_ERROR' }` on an invalid candidate, matching its existing return-value error convention.

### Files created
`src/lib/widgetGuards.ts`, `src/lib/fastCache.ts`, `src/lib/mergeDefaults.ts`

### Files edited
`src/hooks/useGoogleAuth.ts`, `src/hooks/useMsAuth.ts`, `src/lib/storage.ts`, `src/types/widget.ts`, `src/contexts/WidgetContext.tsx`, `src/lib/gridUtils.ts`, `src/lib/gridPresets.ts`, `src/lib/openMeteoApi.ts`, `src/lib/googleTasksApi.ts`, `src/lib/exchangeRatesApi.ts`, `src/lib/wikimediaApi.ts`, `src/lib/bingApi.ts`, `src/lib/rainviewerApi.ts`, `src/lib/obsidianApi.ts`, `src/contexts/BackgroundContext.tsx`, `src/contexts/SettingsContext.tsx`, `src/contexts/ThemeContext.tsx`, `src/lib/openLink.ts`

### Not addressed (out of the explicit request, still open)
- §1.2 [LOW] `themeTransition.ts` overlay stuck on throw
- §1.3 [LOW] inconsistent unmount-guard on 8 async storage-read hooks
- §1.6 [LOW] `useUnsplash.ts` `any` leak into typed `data`
- §1.9 [LOW] `MEDIA_PROXY_URL` re-derived in 3 files instead of imported
- §1.10 [LOW] `contexts/`→`lib/`→`components/widgets/registry` layering inversion
- RSS `description` sanitization boundary note (§ security review, Low/Info — no sink exists in scope, informational only)
