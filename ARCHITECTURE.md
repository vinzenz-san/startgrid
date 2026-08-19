# Architecture

StartGrid is a Firefox/Chrome new-tab-page extension: a React app (`src/App.tsx` → `newtab.html`) that renders a widget grid over a configurable background. There is no background script — everything runs in the new-tab page itself, plus a small shared Cloudflare Worker (`worker/api-proxy.ts`) that fronts a few third-party APIs needing a secret key or CORS relay.

This document covers module boundaries and data flow. See `README.md` for build/setup instructions and the Obsidian-widget user-facing setup steps.

## Data flow: Storage → Contexts → Hooks → Widget UI

```
browser.storage.sync  ──┐                      ┌── AppSettings, ThemeConfig,
  (small, synced)       │                       │   BackgroundConfig, GridConfig,
                         ├─ useStorage(key, …) ──┤   Widget[]  (persisted state)
browser.storage.local ──┘                      └──
  (large / secrets:
   OAuth tokens, Obsidian
   API key, images, caches)
        │
        │  (read directly by hooks/contexts that
        │   need it, bypassing useStorage — see below)
        ▼
  storageLocal.get/set/remove (lib/storageLocal.ts)


        Contexts (src/contexts/*.tsx)                 wrap the above into
        ─────────────────────────────                 app-wide React state:
  SettingsContext   → language, color scheme, accent color, dev flags, i18n t()
  ThemeContext      → widget background color/opacity/shadow/glass/font scale
  BackgroundContext → New Tab background config + resolved CSS
  WidgetContext     → the widget list (CRUD)
  GridConfigContext → grid columns/cell size/gap
  EditModeContext   → drag/resize/settings-enabled toggle
  EditHistoryContext→ undo stack (reads Widget+GridConfig contexts together)
  WeatherEffectContext, SettingsPanelOpenContext, SettingsPanelBoundsContext,
  ElementInspectorContext → smaller, more local UI state
        │
        ▼
        Domain hooks (src/hooks/*.ts)                  per-widget data fetching,
        ──────────────────────────────                 caching, polling:
  useWeather, useWeatherForecast, useRssFeed, useCurrencyTicker, useGoogleTasks,
  useUnsplash, useBing, useAstronomy, useWikimedia, useObsidian, useGoogleAuth,
  useMsAuth, …
        │
        ▼
  Widget components (src/components/widgets/**)   consume both a context
                                                    (e.g. useSettings(), useTheme())
                                                    and their own data hook
                                                    (e.g. useWeather()) to render.
```

### Concrete trace: the Weather widget

1. `src/components/widgets/Weather/Weather.tsx` reads its own persisted config (location, units) from its `Widget.data`, supplied via `WidgetContext`.
2. It calls `useWeather({ latitude, longitude, units })` (`src/hooks/useWeather.ts`).
3. `useWeather` first checks `storageLocal` for a cache entry keyed by `sg:weather:cache:<lat>:<lon>:<units>`. If it's fresh (< 15 min old), that cached value is returned immediately and rendered — no network call.
4. If stale/missing, it calls `fetchCurrentWeather()` (`src/lib/openMeteoApi.ts`), a pure fetch against Open-Meteo (no proxy needed — Open-Meteo sends permissive CORS headers). The result is written back to `storageLocal` and returned.
5. On a failed fetch, `useWeather` falls back to whatever's still in `storageLocal` (regardless of TTL) and flags `isStale: true`, so the widget can show slightly-old data instead of an error.
6. The Weather widget also reads `useTheme()`/`useSettings()` for its font scale, accent color, and language, independently of the weather-data hook.

Other Background-related fetch hooks (`useUnsplash`, `useBing`, `useAstronomy`, `useWikimedia`) follow the same read-cache → fetch-if-stale → write-cache → fall-back-on-error shape, and are all wired into `BackgroundContext` rather than owned by a single widget, since backgrounds aren't a "widget."

### `useStorage` vs. direct `storageLocal` access

`src/hooks/useStorage.ts` is the one bridge from `browser.storage.sync` into React state: it debounces writes (sync storage enforces a 120 writes/min cap), listens for cross-device `onChanged` events, and exposes a `loaded` flag so consumers can tell "still hydrating" apart from "genuinely empty." Every `*Context` that persists a small, syncable preference (`SettingsContext`, `ThemeContext`, `WidgetContext`, `GridConfigContext`, `WeatherEffectContext`) is built on top of it.

Large or sensitive data — OAuth tokens (`googleAuth.ts`, `msAuth.ts`), the Obsidian API key/connection (`obsidianApi.ts`), background images, and the various per-widget data caches — go straight to `browser.storage.local` via `src/lib/storageLocal.ts` instead, bypassing `useStorage` entirely (5MB quota vs. sync's ~100KB, and never synced to other devices). `BackgroundContext` additionally keeps a synchronous `localStorage`-backed "fast cache" (`lib/fastCache.ts`) for a few keys, purely to avoid a first-paint flash while the async `storage.sync`/`storage.local` reads are still in flight.

## Manifest / background-provider separation

Two unrelated things in this codebase are both loosely called "background" or "provider" — worth being explicit that they don't relate to each other:

### 1. `src/manifest.firefox.json` / `src/manifest.chrome.json` — browser extension manifests

Both are Manifest V3. They differ in a few target-specific fields:
- Firefox's carries `browser_specific_settings.gecko` (extension ID, minimum version, data-collection permissions) and `chrome_settings_overrides.homepage` (needed so Firefox shows StartGrid on the very first launch, not just subsequent new tabs) — neither has a Chrome equivalent.
- The `name`/`description` strings differ slightly per store's conventions.
- Both declare the same `permissions` (`storage`, `identity`, `search`), `optional_permissions` (`bookmarks`), and `optional_host_permissions` (`http://127.0.0.1/*`, for the Obsidian REST widgets).

`rspack.config.ts` selects one at build time based on the `--env target=firefox|chrome` flag (`pnpm build:firefox` / `pnpm build:chrome`), copies `src/manifest.<target>.json` to `dist/<target>/manifest.json`, and injects the current `package.json` version into it. There is no runtime branching on "which browser am I in" beyond this — code that needs to differ (e.g. the OAuth redirect URL) does so via `webextension-polyfill`'s cross-browser API surface, not a manifest check.

### 2. `src/lib/backgroundProviders/` — New Tab background source plugins

An unrelated concept: a small registry of modules, one per background *mode* (`preset`, `color`, `gradient`, `colourGradient`, `custom`, `unsplash`, `bing`, `astronomy`, `online`, `wikimedia`), each exporting a `BackgroundProviderDef` with a `resolveCss(config, ctx)` function. `src/lib/backgroundProviders/index.ts` holds the registry (`BACKGROUND_PROVIDERS`) and the two lookup functions `resolveBackgroundCss()`/`getProviderLabel()` that `BackgroundContext` calls. Providers that need network data (Unsplash, Bing, Astronomy/APOD, Wikimedia) don't fetch inside `resolveCss` — fetching and caching live in their paired `use*` hook (e.g. `useUnsplash`), which writes a resolved image URL into `BackgroundRenderCtx`; `resolveCss` itself stays a pure, synchronous function that just turns that context into a CSS string.

This directory was moved here from `src/components/Background/providers/` specifically to fix a layering inversion — `lib/` code (fetch/caching logic, pure CSS resolution) had been living under `components/`, so `components/` couldn't be treated as a layer built on top of a stable `lib/` base. See "Known Tech Debt" below for the remaining half of that same inversion.

## Security mechanisms

- **Link/URL scheme allowlists.** `src/lib/openLink.ts`'s `isAllowedLinkUrl()`/`ALLOWED_LINK_SCHEMES` gate every programmatic tab-open (`openLink()`, middle-click handlers) to `http:`, `https:`, `chrome:`, `chrome-extension:`, `moz-extension:`. `src/lib/urlUtils.ts`'s `normalizeUrl()`/`isDangerousUrlScheme()` separately reject `javascript:`/`data:` schemes when normalizing user-typed URLs (e.g. Quicklinks entries) before they're ever stored or rendered.
- **Render-time sanitization guards.** Quicklinks re-checks a stored URL with an `isDangerous` guard immediately before rendering a link, in case it was persisted before validation existed or was restored from an older backup. `src/lib/obsidianMarkdown.ts`'s `safeHref()` applies the same allowlist logic to links parsed out of vault Markdown — untrusted content that can contain clipped web pages — and the parser emits tokens (never HTML strings), so nothing from a vault note is ever passed to `dangerouslySetInnerHTML`. Excalidraw SVG embeds are rendered via `<img src="data:...">` (`obsidianExcalidraw.ts`'s `svgToDataUri()`), never injected inline, since an inline SVG can carry script/`onload` payloads a browser would execute.
- **Backup-import validation.** `src/components/Layout/BackupRestore.tsx`'s `assertNoDangerousUrls()` recursively walks an imported backup JSON and throws on any string that looks like a URL but isn't on the same allowlist `openLink.ts` uses (with a narrow `data:image/` carve-out for icon fields), and `isValidEnvelope()` checks the file has the expected `{ version, sync, local }` shape before anything is written to storage.
- OAuth tokens (`sg_google_auth`, `sg_ms_auth`) and the Obsidian API key live only in `browser.storage.local`, never `.sync` — confirmed in `googleAuth.ts`/`msAuth.ts`/`obsidianApi.ts`/`oauthPkce.ts` and enforced further by `BackupRestore.tsx`, which explicitly strips those two keys from both export and import so a backup file never carries a live token.

This is a summary, not a full audit — see `AUDIT_CORE.md` / `AUDIT_COMPONENTS.md` for the project's actual security review history.

## Known Tech Debt

`src/lib/gridPresets.ts`, `src/lib/gridUtils.ts`, and `src/lib/widgetGuards.ts` all import `WIDGET_REGISTRY` from `src/components/widgets/registry.tsx` — the reverse of the intended dependency direction, where `lib/` should be the stable base layer that `components/` builds on, not the other way around.

This is a deliberate, deferred decision rather than an oversight: `registry.tsx` is a large (~385-line) UI widget-registration table (icons, default sizes, settings panels, React components per widget type), and splitting the *type/registry data* that `lib/` genuinely needs away from the *UI wiring* that belongs in `components/` would be a bigger refactor than the scope of the fixes that already resolved the other half of this same inversion (moving `rssFeed.mock.ts`/`rssFeedMock.ts`, `astronomyApi.ts`'s fetch logic, and the whole former `components/Background/providers/` directory into `lib/`). Flagged here as a future refactor, not a bug to fix urgently.
