# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: SemVer. Minor bumps mark architecture/feature milestones; patch bumps mark fixes/polish within a milestone.

## [1.18.1] — Media-proxy warnings, local preview fix

- Unsplash and Astronomy (NASA) background panels now show a note when the media-proxy Worker isn't configured for the current build, instead of silently failing (`src/lib/mediaProxy.ts` shared flag, used by `useUnsplash.ts` and `providers/astronomy.ts`)
- Fixed Unsplash/NASA erroring with a generic "NetworkError" when testing `docs/preview` locally over `file://` — the Worker's CORS allowlist rejects the `null` origin `file://` sends. New `pnpm preview:docs` script serves `docs/preview` on `http://localhost:5173`, which the Worker already allowlists, instead of adding `file://`/`null` to the allowlist (would also open the proxy to sandboxed iframes/data: URIs)

## [1.18.0] — Iframe widget, inline Weather forecast, Obsidian vault note picker

- **New Iframe widget**: displays a webpage inside a widget, with an edit-mode overlay so it stays draggable (an iframe is its own browsing context and would otherwise swallow every pointer event). URL field accepts a bare host (`example.com` → `https://example.com`) via a new shared `normalizeUrl()` helper, also now used by Quicklinks instead of its own local regex copy. Many sites block being embedded this way (`X-Frame-Options`/CSP) with no client-side workaround — documented in the widget's own settings hint
- **Weather**: new inline multi-day forecast (3–7 days, toggle + slider in settings) using Open-Meteo's free `daily` forecast endpoint — no new API/key needed. Independent of the existing "open forecast on click" external link
- **Obsidian Pinned Note**: the raw text path field is now a proper vault note picker (`VaultNotePicker`, shared for reuse by other Obsidian widgets later) — typing searches the whole vault by filename, an empty/focused field browses folder-by-folder (breadcrumbs, 📁/📄 rows) starting from the current note's own folder. Backed by the same cached vault index ObsidianRandom's shuffle already builds. Includes an "Open vault" deep-link button and a rebuild-index button for after vault changes
- Every Obsidian widget's "Obsidian Connection" settings block is now collapsed by default behind the same "Open/Close Settings" toggle used for Display Settings elsewhere, instead of always being expanded inline

## [1.17.0] — Global Font Scale

- New single "Font Scale" slider (Settings, 50–200%, default 100%) replaces the 9 separate per-widget font/text-size sliders that used to live in Weather, Greeting, Notes, the 4 Obsidian widgets, Quicklinks, and BookmarkFolder — each now scales its own fixed base size off one shared `--sg-font-scale` CSS variable (`WidgetContainer.tsx`) instead of storing an independent value. Clock and Greeting stay fixed at their own size, matching their existing locked-style treatment (transparency/shadow/glass/gradient are already immune to global/local overrides for these two)
- The 7 widgets that never had a font-size control (Bookmark Search, Outlook Mail, Obsidian Search, RSS Feed, To-Do, Currency Ticker, Rain Radar) now scale with the same slider too — icon-only glyphs (search icons, clear/back buttons, chevrons, empty-state icons) are deliberately excluded, matching how Quicklinks/BookmarkFolder's own icon-size sliders were already kept separate from text size
- Existing per-widget custom sizes are not migrated — a clean reset to each widget's registry default, scaled by the new global slider at 100%
- Settings → Widgets → Appearance: Transparency/Shadow/Glass/Gradient/Dimming sliders all gained a reset-to-default button, matching Font Scale's

## [1.16.7] — Layout picker simplification, RSS preview fallback, preset path fix

- Fixed layout preset thumbnails not loading in the web preview (`docs/preview`) — `previewImage` paths used a leading slash, which resolves against the page's origin root; that happened to work in the installed extension by coincidence but breaks under GitHub Pages' subpath hosting. Paths are now relative, matching how every other build asset reference already works
- Settings → Widgets: removed the Layout Lock/Unlock row (locking is still available via the pencil idle-icon / Ctrl+E) and the text-only "Layout preset" dropdown + Apply button, replaced with a single "Pick a layout" button that opens the same card-grid picker shown at the end of the onboarding tour — no longer buried behind a collapsible sub-section
- RSS Feed: the web preview (`docs/preview` and local dev server) can't guarantee every visitor's browser reaches the proxy Worker, so a first-ever load with nothing cached yet now falls back to clearly-labelled sample content instead of a bare error — never triggers inside the actual installed extension, which still shows the real error state

## [1.16.6] — Layout preset thumbnails

- Focus/Grid/Goals now have real thumbnail images in the post-tour layout picker (480×300 WebP, ~10KB combined) instead of placeholder tiles

## [1.16.5] — Post-tour layout picker scaffolding, tour overflow safety net

- New `LayoutPresetPicker` component: a card-grid version of the existing text-only layout preset dropdown, shown once right after the onboarding tour's final "Got it" (not on Skip). Applies the chosen preset immediately, no confirm step. `GridPreset` gained an optional `previewImage` field — falls back to a placeholder tile when unset, so this ships inert until thumbnail images are added per preset
- `WidgetTour`'s fixed-size dialog box could overflow if a future step's body text ran long enough (verified current EN/DE copy all fits) — the text area now has a max-height + scroll as a safety net instead of silently spilling past the dialog's border

## [1.16.4] — Edit-mode drag-vs-click fixes, RSS entity decoding, calendar sizing

- Fixed edit-mode widget context menu/settings sliders triggering a grid drag instead of the control itself: `react-grid-layout`'s `dragConfig.cancel` selector was never configured, so any pointerdown inside a widget was drag-eligible unless individually `stopPropagation()`'d. A shared `.sg-no-drag` class now marks the gear button and remove button as drag-exempt (the edit-mode info bar itself stays draggable, so dragging by the header still works)
- Fixed Weather and RSS Feed items registering a drag-release (mouseup after dragging the widget) as a click, which opened the forecast/article link unintentionally. New shared `useClickDragGuard` hook (`lib/clickDragGuard.ts`) compares pointerdown vs. click coordinates and ignores the click if the pointer moved more than 5px, used by both widgets instead of a plain `onClick`
- Fixed RSS Feed items showing raw HTML entities (e.g. `&#8217;`) instead of the decoded character — some feeds HTML-escape their content on top of XML escaping, sometimes more than once; `rssApi.ts` now decodes iteratively until stable instead of trusting the XML parser's single decode pass ([#6](https://github.com/vinzenz-san/startgrid/issues/6))
- Google Calendar and Outlook Calendar default size increased from 2×3 to 5×5 — too small to be useful at the old default
- Settings page now has a "Report an Issue" link (GitHub issues) alongside the existing support link

## [1.16.3] — Grid preset rebuild, unified widget spacing, factory-reset fix

- **"Grid" layout preset rebuilt** as a 3-column layout: Clock/Greeting/Bookmark Search full-width, then RSS Feed (pre-filled with a feed URL), Quicklinks (list layout, one pre-filled link with a white badge), and Weather (Berlin, pre-resolved coordinates) stacked above Notes. New `layout` field on `GridPreset` supports fully explicit multi-column positioning, for layouts too irregular for the existing single-column stacking mode
- Fixed Factory Reset not resetting the background: `BackgroundContext`'s synchronous first-render cache lives in plain `localStorage` (separate from `browser.storage`, by design, for pre-hydration speed), which the reset never cleared — the stale background survived and reappeared instantly on reload. `clearAllStorage()` now sweeps every `sg:`-prefixed `localStorage` key too, in both the extension and dev-preview builds
- Unsplash's default "show new photo" rotation changed from 15 minutes to 1 day
- **New unified widget spacing token** (`--sg-widget-inset`, index.css) — previously every widget hand-rolled its own outer content padding independently (Notes: 10px/12px, RSS Feed: none at all, To-Do: none, Calendar: a per-section grab-bag of 8-10px). RSS Feed and To-Do had content sitting flush against their own edges as a result. Notes, RSS Feed, To-Do, and Clock now reference the shared token; Greeting's Padding slider removed (was a separate, independently-adjustable mechanism) in favor of the same fixed token; Calendar's per-section left/right insets aligned to the token's value while keeping their own top/bottom/gear-button-clearance spacing

## [1.16.2] — Locked-style Clock/Greeting, auto-fit Clock text, grid-overlay contrast fix

- Clock and Greeting now have their local style (Transparency/Shadow/Glass/Gradient Intensity) permanently fixed to 100%/0%/0%/0% — no longer user-editable, immune to global theme settings, and immune to "Reset all widget styles" (new `lockedStyle` registry flag, `WidgetContainer.tsx` ignores stored/global values entirely for these types and hides the Local Style section)
- Clock's Font Settings and Display Settings panels removed entirely. Time text now auto-scales to fill its box via a new `FitText` component (measures its own size + the time string's aspect ratio on every resize, no manual font-size setting to drift out of sync); date text uses a fixed size. Both bumped up from the first pass — time bolder (font-weight 600) and less conservative about box-filling, date resized to match
- Greeting: default alignment changed to centered (was left), default font size bumped (22px → 28px)
- Fixed the grid's edit-mode dot-grid/glow-line overlay losing contrast against background colors near the accent color's own hue (e.g. blue/purple) — a full-viewport semi-transparent dark scrim now sits behind the grid/widgets during edit mode, instead of relying purely on the accent-colored glow for contrast
- Reverted the default "Color Gradient" background from white/black back to blue/purple (`#3498db` → `#9b59b6`) now that the overlay contrast issue above is fixed at the source
- Fixed widgets becoming inaccessible above the viewport (only reappearing after leaving edit mode) once a grid's content grew taller than the window with Vertically Center Grid on — `align-items: center` on the grid wrapper cut off content that overflowed past the start edge with no way to scroll to it; changed to `align-items: safe center`, which falls back to top-anchored specifically when centering would strand content like that

## [1.16.1] — Preset sizing refinements, per-widget default style, shared transparent-text-shadow

- Focus preset: Clock 15×2, Bookmark Search 11×1 centered (col 3, matching a 15/11 split); Goals preset rebuilt as a proper vertical stack (was using free-slot auto-placement) — Clock 15×2, Greeting 15×1, Bookmark Search 15×1, an Invisible Spacer, then To-Do sized 5×3 and centered
- New `defaultStyle` field on widget registry entries — a local-style override (transparency/shadow/glass/gradient) applied to every newly created instance of that widget type, whether added via the Add Widget menu, Ctrl+K, or a layout preset, not just preset-created ones. Clock now carries its 100%/0%/0%/0% style this way; the old preset-only duplicate of this override was removed now that the registry is the single source of truth
- Fixed the To-Do widget's "Add a task…" field looking cramped compared to Bookmark Search's input — added matching top/side padding scoped to just this field, not the shared input style used everywhere else
- **New: shared, always-on text-shadow for fully transparent widgets.** Any widget at 100% Transparency (whether via the global setting or a per-widget local override) now automatically gets a soft blur + sharp offset text-shadow on all its text, for readability against whatever's showing through — no new setting, not configurable, purely tied to full transparency (mirrors Shadow Intensity's box-shadow, but on the text itself rather than the widget's box)

## [1.16.0] — Configurable grid settings, layout presets overhaul, edit history/undo

- New Grid settings: **Grid Columns** and **Grid Spacing** (defaults 15 cols / 15px, both apply live, no separate Apply step), **Full Page Grid** (stretches columns edge-to-edge, drag switches to no-push placement so widgets don't get shoved around, includes a live "fits X columns at Y px" hint), and **Vertically Center Grid** (default on — centers sparse layouts in the viewport instead of anchoring to the top)
- **Layout presets renamed and reworked**: **Focus** (Clock + Bookmark Search, centered and stacked), **Grid** (Clock/Greeting/Weather/Calendar/Quicklinks/Bookmarks/Notes/To-Do/RSS, was "Full Dashboard"), **Goals** (Clock/Greeting/To-Do, was "Productivity") — each preset's dropdown now also shows a one-line description. Clock and Bookmark Search default sizes increased (4×2 / 4×1), Bookmark Search now defaults to Google-fallback on. Focus is now also the first-run and post-factory-reset default layout
- Clock widget defaults changed: seconds/date off, allow-overflow on, Medium (500) font weight, 1.5x display scale, 60px font size
- Default "Color Gradient" background changed from blue/purple to white/black — the old default fought the grid's accent-colored glow overlay for visibility on a fresh install; also now the first-run/factory-reset default background
- **New Edit History panel + Ctrl+Z undo** (Settings → Settings, on by default): tracks the last 10 widget/grid layout changes (move, resize, add, remove, grid setting changes, reset, compact, preset apply) as one undo step per gesture, not per frame/tick. Ctrl+Z falls through to native text-undo while a text field has focus. Floating panel shown during edit mode, positions itself beside the Dev Panel when both are open; deliberately doesn't track per-widget content/style edits (background, widget colors, Notes text, etc.)
- Layout Lock/Unlock and Layout Preset controls moved out of the Widgets section's main body into a collapsible "Layout" sub-section (matches the existing "Display Settings" pattern); Export/Import Layout removed entirely
- Fixed the Widgets-section hover-glow effect getting stuck on after exiting edit mode or applying a layout preset — both could reflow the settings sidebar out from under a stationary cursor without a `mouseleave` ever firing to clear it

## [1.15.0] — Grid layout engine migrated to react-grid-layout

- Replaced the hand-rolled CSS Grid + native-HTML5-drag layout system with `react-grid-layout`: smoother drag/resize, live "rubber-band" displacement of neighboring widgets while dragging (vertical auto-compaction, `preventCollision: false`), and a drag-start layout snapshot that restores every displaced widget back to its exact starting position if a drag is cancelled or dropped back on its origin cell
- Fixed the resize-handle hitbox being too small and hard to grab precisely — now an explicit 20×20px visible grip with a 24×24px invisible hit zone, with clearer diagonal grip-line styling
- Fixed the widget-crash and "Missing Widget" fallback cards' header/background colors not adapting to Light Mode
- Edit mode's per-widget header now shows the widget's localized type name (e.g. "Outlook Mail") next to its w×h size badge, not just the size
- New **Invisible Spacer** widget — a purely transparent layout filler (no background/border/shadow in view mode, dashed placeholder outline with a label in edit mode) for deliberately leaving gaps in a layout
- Fixed the Calendar, Outlook Calendar, and Outlook Mail widgets' mock/preview data taking a visible ~650ms to appear even with no real network call — a leftover artificial `setTimeout` meant to simulate network latency was firing even for already-known static mock data; removed from all three

## [1.14.7] — Widget crash isolation + Dev Panel crash testing

- Widgets are now individually isolated behind a React error boundary: if a widget's own render throws, only that widget shows an inline "Widget crashed" fallback (Reload / Remove) instead of taking down the whole new-tab page
- Dev Panel gained a **Crash Widget** control (dropdown of active widgets + Trigger Crash button) to simulate a widget throwing on its next render, for exercising the new error boundary without needing a real bug

## [1.14.6] — Fix Bookmark Folder icon overrides being wiped on reopen

- Fixed per-link icon overrides (custom icon, white badge) in the Bookmark Folder widget silently reverting the next time the new tab page opened. The widget's "self-heal" logic — meant to prune overrides for bookmarks that were actually deleted — ran against a transient empty children list returned while the `bookmarks` permission check was still resolving, wiping every override before the real bookmark list had a chance to load. It now waits for that permission check to settle before pruning

## [1.14.5] — Removed device geolocation, reduced AMO data collection declaration

- Removed the "📍 Use Current Location" button from the Weather widget and from the background weather effect's location picker — both now set a location only by searching for a place name, same as they already supported. StartGrid no longer calls `navigator.geolocation` anywhere, so the browser's location-permission prompt for this extension is a thing of the past
- Firefox's AMO listing no longer declares `locationInfo` as a data type StartGrid can collect, reflecting the above; `personallyIdentifyingInfo` and `bookmarksInfo` remain declared as optional (opt-in) collection, correcting an unrelated listing bug where both had been marked required instead of optional
- Updated the privacy policy's Location section to describe search-by-name only

## [1.14.4] — Screenshot Mode, shared scrollbar/contrast fixes, storage-quota fix

- New **Screenshot Mode** (Developer Options → DevPanel): forces every widget with a mock/demo data path (Calendar, Outlook Calendar/Mail, Bookmarks, Bookmark Search, the mock-gated Obsidian widgets) to show that fake data with no "preview data" badge — including inside a real loaded extension, where those paths otherwise never trigger. Built for taking clean store/marketing screenshots without exposing real accounts, calendars, or bookmarks. Bookmarks' mock path is a deliberate exception to its usual "never fake real bookmarks" rule, specifically for this purpose
- Unified every widget's scrollbar (Calendar, Outlook Calendar/Mail, the mock-gated Obsidian widgets, Bookmark/Obsidian search popouts, Notes, Obsidian Quick Capture, and Obsidian markdown code blocks) onto the single shared `.sg-scroll-thin` style — several had either no custom scrollbar at all (native Chromium scrollbar) or a hand-rolled near-duplicate that didn't track the same theme variables
- Fixed low-contrast secondary text in dark mode: `--text-muted` (widget titles, hints, the To-Do checkbox border, and 25+ other consumers) was `#64748b`, roughly half the contrast of its light-mode counterpart against widget backgrounds — brightened to `#94a3b8`
- Fixed `Uncaught (in promise) Error: This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota` — `chrome.storage.sync` allows 120 writes/minute, and neither the shared `useStorage` hook nor `BackgroundContext`'s hand-rolled persistence debounced writes, so dragging a slider or gradient color picker could fire far more writes than that in a few seconds. Both now debounce through a new shared `lib/debounce.ts` utility (~400ms), coalescing a whole drag gesture into one write
- Fixed the Currency widget having no padding at all (unlike other widgets, it never picked up the Display Settings "Padding" slider treatment) and a bug where changing the base currency to one already selected as a target left a self-comparison row (e.g. "USD/USD") with no way to deselect it

## [1.14.3] — Fix RSS feed encoding, privacy policy corrections

- Fixed the RSS Feed widget mangling non-ASCII characters (German umlauts especially — `ü`/`ö`/`ä` turning into `�`) on feeds served as ISO-8859-1/windows-1252 without an explicit charset in the HTTP `Content-Type` header. `res.text()` always decodes as UTF-8 in that case — it never looks at the XML prolog's own `encoding=` attribute — so the fetch now reads raw bytes and picks a decoder from the HTTP header's charset, then the prolog's, defaulting to UTF-8 only if neither says otherwise
- Corrected two inaccuracies in the privacy policy's Obsidian section: it claimed note contents are "never written to storage" (Daily Note and Pinned Note have cached last-loaded note content in `browser.storage.local` for offline fallback since 1.11.1 — this was already wrong, not something this release introduced) and it didn't yet disclose 1.14.2's new full-note edit capability as a write path

## [1.14.2] — Inline edit for Obsidian Daily Note and Pinned Note

- **Obsidian Daily Note and Pinned Note can now be edited in place**, not just read: a new pencil button opens a raw-Markdown editor (Save/Cancel) that writes the whole note back through the REST plugin's `PUT /vault/...` endpoint. Limited to these two widgets since they're the only ones that display a full note body — Random Note only shows a short excerpt, Vault Search shows cross-note snippets, and Quick Capture is already write-oriented but for appending new entries, not editing existing content
- Editing always operates on the **whole raw note**, ignoring each widget's section/task-only/max-lines display filters — re-splicing an edited filtered slice back into the right spot in the full note was judged too easy to get subtly wrong (duplicated or dropped headings)
- Reuses the same re-read-before-write conflict check the Daily Note's checkbox toggle already had: saving re-fetches the note first, and if it no longer matches what was loaded when editing started (i.e. it changed in Obsidian meanwhile), the write is refused and the widget reloads the latest version instead of clobbering it — surfaced with the same "changed in Obsidian" banner, now shared between both widgets (`.sg-obs-conflict`)
- Pinned Note's settings no longer claim the widget is "read-only — edit in Obsidian", since that's no longer true

## [1.14.1] — Quicklinks icon-picker fix, Obsidian Daily open-in-Obsidian

- Fixed the Quicklinks "Manage Links" panel closing itself the instant you picked "URL" or "Upload" from a link's icon-source dropdown, instead of revealing the URL/upload field. The dropdown's option menu renders in a `document.body` portal outside the panel's own DOM subtree, so the panel's outside-click-to-close listener treated selecting an option as a click outside the panel. It now ignores clicks inside `.sg-dropdown-menu`, matching the guard `WidgetContainer` already had for its own outside-click handling
- Obsidian Daily Note gains an **"Open in Obsidian"** header button (same `obsidian://`-free REST deep-link used by Pinned Note/Random Note), shown once the note exists — previously the widget could create today's note but offered no way to work on it without switching to Obsidian yourself

## [1.14.0] — Bottom control bar redesign, Rain Radar refinements

- **Reworked the dashboard's top floating control cluster into a bottom control bar with two shapes.** Idle state (not editing): two small icon-only corner buttons — a settings gear (bottom-left) and a pencil that enters edit mode (bottom-right), no full bar. Editing: those collapse into one full-width bar spanning the bottom edge with Add Widget, Settings, the theme toggle, and a labeled "Finish Editing" button (replaces the old icon-only lock/unlock concept). The two Add-Widget entry points (sidebar + a separate floating pill) are now one shared instance living in the bar
- Dropped the **"Button Position" setting** entirely — the bar is hardcoded full-width-bottom now, so a repositionable floating pill no longer applies; the Settings Sidebar always slides in from the right (its previous default). Swept the setting out of `SettingsContext`, `SettingsPanel`, `DevPanel`'s sidebar-side snap logic, and the removed i18n keys
- Settings Sidebar now stays flush with the bottom bar instead of either running underneath it or leaving a gap of visible page background below it: the panel's own box always extends to the bottom edge, but a real non-scrolling footer element (mirroring how the header already works, not scroll-area padding — padding on a flex+overflow container is unreliable once content overflows) keeps content from visually reaching that space when idle; in edit mode the panel simply stops short by the bar's exact height instead
- Fixed a light-mode contrast bug introduced by the redesign: the bottom bar's background never actually adapted to light mode (stayed the dark pill) while its buttons' text/border colors did, so "Add Widget"/"Settings" were only readable on hover
- Onboarding tour (`WidgetTour`) reworked to match: retargeted selectors to the new idle-icon/bottom-bar elements, reordered steps since Add Widget only exists once edit mode is on (entering edit mode now has to be demonstrated first), rewrote copy off the old hover-reveal-cluster wording, and removed the now-dead `forceReveal` mechanism entirely
- **Rain Radar widget** (introduced in 1.13.0) refinements from live testing: default zoom moved from country-wide (6) to city-level (9), with the zoom range decoupled from the radar tile's native 7-zoom ceiling (only `maxNativeZoom` stays tied to that); added a Recenter button (animated `flyTo`, not an abrupt `setView`) and a manual Play button for stepping through frames on an interval; fixed the radar overlay silently disappearing on every light/dark theme toggle (recreating the whole Leaflet map on theme change also reset the double-buffered overlay refs with nothing left to rebuild them — now only the base tile layer's URL swaps); fixed the map not resizing when the widget itself was resized via `ResizeObserver.invalidateSize()` (also fixes Recenter targeting the wrong pixel offset after a resize); added a new "Terrain" map style option (CARTO's Voyager, same trusted CDN as the existing light/dark styles) with a CSS filter boost for more vibrant colors, since Voyager alone reads as washed-out next to references like WetterOnline; added a fixed-pixel-size (not real-world-scaled) red pin marker at the configured location, so it stays visible even zoomed out

## [1.13.0] — Rain Radar widget, Weather forecast link, Google Tasks unrestricted

- New optional **Rain Radar widget**: a Leaflet map (CARTO free basemaps, theme-matched light/dark tiles) showing a live precipitation overlay from [RainViewer](https://www.rainviewer.com/api.html) (free, no API key). Manual scrubber (slider + prev/next) over every available frame — including RainViewer's short-term nowcast frames when it has any, labeled "Forecast" past a "Live" marker — plus a Play button to auto-step, and a Recenter button (animated `flyTo`) back to the configured city at the default zoom. No auto-animate on load; deliberately manual-first per explicit feedback that unsolicited motion read as flickery
- Base map tiles come from CARTO, not `tile.openstreetmap.org` directly: OSM's own volunteer-run tile servers explicitly disallow bulk/embedded use from distributed apps in their Tile Usage Policy, which is what actually caused an early 403 ("Referer is required") — not a missing header. CARTO's basemaps (built on the same OSM data) permit this use case with attribution, which stays on (`attributionControl`) since the tile license requires it
- Radar frame swaps are double-buffered (two tile layers, next frame preloaded fully hidden and swapped in only once loaded, with a fallback timer in case Leaflet's `load` event doesn't fire) and `fadeAnimation`/`.leaflet-tile` opacity are forced off — Leaflet's own per-tile fade-in, not just naive layer remove/re-add, turned out to be the real source of a "flashing" look across several iterations of this feature
- **Weather widget**: new optional "Open detailed forecast on click" setting (off by default) with a provider choice — Google (queries by city name when known, coordinates otherwise, for a nicer results page), Windy, or WetterOnline (city-slug URL, best-effort — no public API to construct precise or coordinate-based links against, see [[project_startpage]])
- **Google Tasks source for the To-Do widget is no longer gated behind Developer Options.** `tasks.readonly` has since been verified by Google (was previously conditionally requested only for opted-in testers to avoid burning this project's limited unapproved-scope user slots — see 1.12.0's note); it's now folded into `APPROVED_SCOPES` unconditionally, same as `calendar.readonly`

## [1.12.0] — Google Tasks source for the To-Do widget

- The To-Do widget gains a **Source** setting: "Local" (unchanged — add/check/delete/reorder tasks stored on the widget itself) or **"Google Tasks"** — a read-only view of a Google Task list, using the same shared Google OAuth client as the Calendar widget (`tasks.readonly` scope, verified against Google's REST reference before building against it, not assumed). No write access requested or possible — checking or adding a task in the Google Tasks source isn't offered, since `tasks.readonly` genuinely can't do it
- Built with the `isStale` cache-fallback pattern from the start (like every network-backed widget added this session): a failed refresh shows the last-loaded tasks with a small banner instead of a bare error
- **Gated behind Developer Options until `tasks.readonly` is verified.** Unlike Outlook Mail/Calendar's scope addition, this one is *not* live for regular users yet: because Calendar and To-Do share one Google OAuth client/request, unconditionally adding an unapproved scope would make every plain Calendar connect — not just Tasks — show Google's "unverified app" warning and burn one of this project's 100 lifetime unapproved-scope user slots (a hard cap that can never be reset). `connectGoogle()` only requests `tasks.readonly` when Developer Options is on; the Source dropdown's "Google Tasks" option is hidden otherwise. Same gating Calendar itself went through before its own verification landed
- Privacy policy updated ahead of this (see the previous commit) to disclose the new scope before submitting Google's sensitive-scope verification for it, not after

## [1.11.1] — Offline cache for Obsidian Daily Note and Pinned Note

- Extended the `isStale` cache-fallback pattern to **Obsidian Daily Note** and **Pinned Note**: a failed refresh now shows the last successfully loaded content for that exact note path instead of a bare error, with a small "showing cached note" banner. No TTL here (unlike Weather/rates) — a note's content doesn't drift on its own, so any previously-fetched copy stays valid to show while a refresh keeps failing
- Deliberately **not** applied to Obsidian Random Note or Obsidian Search: both are "give me something different" widgets (a fresh shuffle, a fresh query) — falling back to stale cached content after a failed request there would look like a successful new result while actually showing old, unrelated content. Left with their existing plain error state instead

## [1.11.0] — Shareable layouts, offline cache for Calendar/Outlook Mail

- New **Export/Import layout** (Settings → Widgets, next to the presets added in 1.10.0): saves just your widget layout as a `.json` file you can share or restore from — deliberately its own focused format, not the full `BackupRestore` dump. Widget data never contains OAuth tokens (those live in their own separate storage keys) or the Obsidian connection (also stored separately), so exporting just the widget layout needed no sensitive-data filtering
- Extended the `isStale` cache-fallback pattern (added in 1.9.0 for Weather/RSS/background images) to **Calendar, Outlook Calendar, and Outlook Mail**: a failed refresh now falls back to the last successfully loaded events/messages instead of a bare error screen, with a small "showing cached data" banner. This was explicitly deferred when 1.9.0 shipped since these three had no cache at all yet — now added
- Deliberately left out of the layout-share feature: bundling background/theme settings into the same shareable file. The background config's storage key is already flagged (in project notes, not yet fixed) as including the user's Unsplash API key — reusing it for a new file explicitly meant for sharing would make that worse, not better, so this stays layout-only for now

## [1.10.0] — Grid layout presets, Command Palette, Currency widget

- New **Layout presets** (Settings → Widgets): pick "Minimal", "Productivity", or "Full Dashboard" and apply it in one click — replaces every widget currently on the grid with a non-overlapping preset layout, behind a confirmation dialog since it's destructive. Built on `WidgetContext.replaceAllWidgets`, an existing bulk-write primitive already used by the grid-rescale flow
- New **Command Palette** (`Ctrl+K`, works from anywhere): fuzzy-ish substring search over all 18 widget types, Enter or click adds the top/selected match. Same "raw keydown listener, no shared shortcut registry" pattern the Bookmark Search widget's own `Ctrl+Shift+F` already uses — the codebase has no shared hotkey system, and one more standalone listener wasn't worth inventing one for
- New optional **Currency widget**: shows live exchange rates for a base currency against any number of selected target currencies, refreshed on an interval. Backed by [Frankfurter](https://frankfurter.dev) (ECB rates, free, no API key, genuinely CORS-open — verified directly via `curl` before building on it, not assumed). No real free/keyless/CORS-open stock-price API exists to verify the same way, so this widget is currencies only, not a general "ticker." Built with the `isStale` cache-fallback pattern from the start (see 1.9.0), not retrofitted later
- Refactored the "add a widget of type X at the first free grid position" logic (previously only in the Add-Widget menu) into a shared `buildNewWidget` helper in `lib/gridUtils.ts`, now used by both the Add-Widget menu and the new Command Palette instead of duplicating it a second time

## [1.9.0] — To-Do widget, offline cache fallback

- New optional **To-Do widget**: add/check off/delete/reorder tasks (pointer-based drag reorder, ported from Quicklinks' own implementation), "Hide completed" toggle and a "Clear completed" action in Settings. Items are stored directly in the widget's synced data (like Quicklinks' link array) — no separate local/synced storage mode like Notes has, since short task text is nowhere near the sync-storage size limits that motivated that split there
- Fixed a real gap found while auditing offline behavior: `useWeather`, `useRssFeed`, `useUnsplash`, and `useBing` all cache their last successful fetch in `storageLocal`, but none of them re-read that cache when a refresh *fails* — a network blip showed a bare error screen (or, for the two background-image hooks, silently dropped back to nothing on a first-load failure) instead of the perfectly good data already sitting in cache. All four now fall back to the cached value on fetch failure and expose it via a new `isStale` flag; Weather and the RSS Feed widget surface a small visual indicator when showing stale data
- Audited but explicitly left out of scope: `useCalendar`/`useOutlookCalendar`/`useOutlookMail`/the Obsidian widgets have no persisted cache at all today — adding one is a bigger, separate feature, not a fix to an existing mechanism

## [1.8.0] — RSS Feed widget

- New optional **RSS Feed widget**: shows an RSS/Atom feed as a clickable item list (title, optional description snippet, relative published time). One feed URL per widget instance — add multiple instances for multiple feeds
- Most feeds send no CORS headers, so the extension can't fetch them directly from the browser without declaring broad host permissions. Routed through a new `/rss?url=` route on the existing Cloudflare Worker instead (same model as the Unsplash/NASA/OAuth-token routes already there), so no new extension permission was needed. The Worker only relays raw bytes; parsing happens client-side via a small hand-rolled RSS 2.0/Atom parser (`lib/rssApi.ts`, `DOMParser`-based, no new dependency — same philosophy as `lib/obsidianMarkdown.ts`'s own hand-rolled subset parser)
- `useRssFeed.ts` ports the request-id stale-response guard added to `useWeather` in 1.7.6, built in from the start rather than retrofitted later
- Privacy policy updated to describe the new proxy route: the feed host sees the Worker's network location, not the user's, and feed content is parsed in-browser, never on the Worker

## [1.7.6] — Weather widget stale-state fix

- Fixed a race in `useWeather` where switching location or units while a fetch was still in flight could apply a resolved, now-stale result and show weather for the wrong place. A request-id ref bumped on every param change and by `fetchWeather`'s own start now gates both the cache-lookup effect and `fetchWeather` before either calls `setState`

## [1.7.5] — Typed `import.meta.env`, Chrome Web Store ID release note

- Replaced six `(import.meta as any).env.X` casts (`appVersion.ts`, `googleAuth.ts`, `msAuth.ts`, `useUnsplash.ts`, `astronomy.ts`) with a single ambient `ImportMetaEnv`/`ImportMeta` declaration (`src/env.d.ts`) typing the three keys `rspack.config.ts`'s `DefinePlugin` injects at build time. `astronomy.ts` keeps its own local `.replace()` derivation of the proxy URL rather than importing a precomputed constant — that indirection is what stops the minifier from folding it to a constant and dead-code-eliminating the NASA API key fallback branch
- Documented Chrome Web Store listing ID verification as an explicit manual release step (comment in `worker/api-proxy.ts`) — a future ID change (rename, republish, policy relist) would silently 403 real users again, as already happened once, and no automated check for it exists

## [1.7.4] — Shared Calendar/OutlookCalendar data-fetch hooks, `any` → `unknown` at the widget registry boundary

- `useCalendar` and `useOutlookCalendar` duplicated their entire fetch/refresh state machine (mock data, `fetchingRef` re-entrancy guard, multi-calendar `Promise.all` + sort, `UNAUTHORIZED` handling) despite already sharing the same `CalendarEvent`/`CalendarViewStatus` shape via `CalendarCore.tsx`. Extracted the provider-agnostic state machine into `shared/useProviderCalendar.ts`, driven by a per-provider config — only the actual Google/Graph HTTP calls, response mapping, and mock event content stay provider-local
- `WidgetEntry.renderComponent`/`renderSettings` and `WidgetContainer`'s `handleUpdateData` switched from `any` to `unknown` for widget data/patch — the one place per-widget typing gets erased for dynamic dispatch by `widget.type`. This surfaced a real latent gap the `any` had been silently papering over: `updateWidget`'s `Partial<Widget>` patch was never actually checked against the discriminated union here, now made explicit with two documented casts instead of an implicit `any`

## [1.7.3] — Shared OAuth/PKCE core, proxy Worker rename

- `googleAuth.ts` and `msAuth.ts` duplicated ~90% of their PKCE, storage, and token-refresh logic; extracted the provider-agnostic parts into `oauthPkce.ts`, driven by a per-provider config — including the previously silent Google/MS drift on whether `scope` is sent during token refresh. Public API and storage keys are unchanged
- Updated every reference to the Cloudflare Worker's URL after it was renamed `startgrid-unsplash-proxy` → `startgrid-api-proxy` in the dashboard (`.env`, `.env.example`, `wrangler.toml`, `docs/privacy.html`)
- Fixed two lint warnings: `StoredAuth`/`StoredMsAuth` were empty interfaces extending `StoredAuthBase` with no added members (now type aliases); `useUnsplash`'s `fetchImage` and `ElementInspector`'s hover-listener effect were missing exhaustive-deps entries (`uc`/`setImageUrl`, `addCopiedElement`)

## [1.7.2] — Close CORS no-origin bypass, rate-limit the proxy Worker

- Requests without an `Origin` header previously skipped the Cloudflare Worker's CORS allowlist entirely, letting non-browser clients spend the Unsplash/NASA API keys and OAuth token-exchange routes unbounded. Now rejected with `403` like any other unrecognized origin
- All proxy routes are additionally rate-limited per IP (60 req/min, fixed window via Workers KV) as defense in depth against a caller that fakes a valid `Origin` header

## [1.7.1] — Fix onboarding tour re-triggering after being seen

- Fixed the first-run widget onboarding tour sometimes reappearing on a new tab even though it had already been finished or skipped, without any browser restart. `SettingsContext` discarded the `loaded` flag `useStorage` returns, so `widgetTourSeen` sat at its `SETTINGS_DEFAULTS` value (`false`) until its own `storage.get()` resolved. Grid.tsx's auto-trigger effect only waited on the widgets store's `loaded`, which is a separate, unordered storage read — on any tab where widgets happened to hydrate before settings, the effect fired while `widgetTourSeen` was still stuck at the default and reopened the tour. The effect now also waits on `SettingsContext`'s own `loaded`

## [1.7.0] — Background weather effect (rain/snow)

- New optional **background weather effect**: animated rain or snow rendered behind the widget grid, driven by live weather at its own independently-set location (Settings → Settings, right after Disable Background Blur — not tied to any Weather widget instance, so it works with zero or several on the dashboard). Off by default
- Rendered via small sprite textures blitted onto a canvas rather than procedural shapes — cheap and crisp regardless of particle count. Other conditions (clear, clouds, fog, thunderstorm) currently render nothing; only rain and snow are implemented
- Auto-plays for ~10s after a new tab opens, fading in and back out, rather than running as a persistent always-on animation — pauses entirely while the tab is hidden and is skipped outright under `prefers-reduced-motion`
- Developer Options gains a "Force Weather Effect" override to preview rain/snow instantly without waiting on real weather or wiring up a location

## [1.6.14] — Weather overhaul, slider reset buttons, calendar/search polish

- Weather widget: condition/feels-like/location text now uses the primary `--text` color instead of `--text-muted`, matching the temperature number and making the light/dark theme switch actually visible (previously two similar grays made it look unchanged); new **Alignment** setting (left/center/right/top/bottom, top/bottom correctly centering on the cross-axis rather than pinning to a corner); new **Display Settings** panel (Font Size/Scale/Rotation/Padding), with icon/condition/feels-like/location sizes scaling proportionally off the Font Size slider; location display now shows only the city name (full "City, State, Country" is kept for the settings-panel search results); gains the same opt-in **"Allow overflow"** toggle as Clock/Greeting (see 1.6.13), and feels-like/location no longer ellipsis-truncate while overflowing
- `SettingsSlider` gains an optional reset button (small ↺ icon, dimmed once at default) — wired up for Font Size/Scale/Rotation/Padding (Display Settings) and the font outline-size slider
- Bookmark Search: opt-in **"Fall back to Google search"** — when no bookmark matches, Enter or a results-panel button opens a Google search for the query in a new tab. The "autofocus on new tab" toggle added in 1.6.13 was removed again after confirming it can't reliably work — the browser keeps focus in the address bar on a fresh tab — so the dead toggle/effect are gone rather than left inert
- Calendar/OutlookCalendar now default to **Monday** as first day of week (was Sunday) for anyone who hasn't explicitly changed the setting — the Sunday/Monday toggle itself already existed

## [1.6.13] — Settings-button slide-in, per-widget overflow toggle

- Settings gear button no longer gets covered by the Settings sidebar when it opens on the same side (`top-left`/`bottom-left`/etc.) — the control cluster now shifts clear of the panel in sync with its open/close transition, instead of sitting underneath it
- New opt-in **"Allow overflow"** toggle on Clock and Greeting — lets text spill past the widget's own box instead of being clipped (e.g. a large clock font bleeding into the grid's dead space). Overflowing widgets are never given their own `z-index`; instead every *other* widget is raised above the default stacking level, so overflow reliably renders behind neighbors regardless of DOM order (an earlier attempt lowering the overflowing widget itself broke its own gear button's click-through)
- Greeting gains a **"Single line (no wrap)"** toggle (shown once overflow is on), so a long greeting can spill sideways instead of wrapping
- Bookmark Search gains an "autofocus on new tab" toggle (**removed again in 1.6.14** — see that entry)

## [1.6.12] — Settings UI: dropdown unification, button-position/theme pickers, row-width alignment

- Every remaining "options" picker built as a hand-rolled `SegmentedControl` (BookmarkFolder/Quicklinks Layout, Weather units, Clock format, Notes storage, ObsidianRandom refresh mode, ObsidianCapture target, Calendar/OutlookCalendar view + first-day-of-week, FontSettingsPanel outline style, and the Background editor's Date mode + Gradient type) is now a shared `Dropdown`, matching Alignment/Sort order/Timezone-style controls elsewhere in the same panels
- Global Settings → Button Position is now a `Dropdown` (arrow + label) instead of the 6-button `DirectionPicker` grid — the grid's own box height didn't follow `--sg-control-h`, so it visibly threw off row-to-row spacing in the sidebar. `DirectionPicker` had no other consumers and was deleted along with its CSS
- Global Settings → Global Theme is now a Dark/Light `Dropdown` instead of the pill `ThemeToggle` switch (same root cause — the toggle's 28px box didn't match `--sg-control-h`). The toggle's dip-to-dark fade transition was pulled out into a shared `runThemeTransition` helper (`lib/themeTransition.ts`) so both this dropdown and the two remaining `ThemeToggle` instances (top-bar cluster, per-widget local override) trigger the identical effect from one place instead of duplicating it
- `.bg-color-swatch` (accent-color swatch, letterbox-color swatches, gradient from/to swatches) shrunk from 36×28px to a `var(--sg-control-h)` square everywhere it's used, for the same row-alignment reason
- Every `Dropdown`/`SegmentedControl` control inside a `SettingsRow` now gets a shared `width: 50%` (`Form.css`), so a panel's controls line up at a consistent right edge instead of each sizing to its own content
- Background editor's Position row (Image, Online Image, Bing, Astronomy, Unsplash, Wikimedia) moved from a bespoke stacked `bg-position-row` layout (label above a full-width dropdown) onto the standard `SettingsRow`, consistent with every other row in the same panels; the now-unused `.bg-position-row` CSS was removed
- Removed dead `.sg-cal-seg`/`.sg-cal-seg-btn` CSS in `Calendar.css` — an orphaned, unreferenced segmented-control implementation predating the shared `SegmentedControl` component

## [1.6.11] — Multi-calendar support for Google Calendar and Outlook Calendar

- Both calendar widgets previously only ever fetched the account's single default calendar (Google's `primary` alias / Outlook's `/me/calendarView`), with no way to see events from any secondary calendar (e.g. a custom Google calendar like "Birthdays" or a shared Outlook calendar). Settings now gain a **"My Calendars"** checkbox list (shown once connected) listing every calendar on the account, colored to match each calendar's own color from the provider — same interaction as Google/Outlook's own native calendar UI
- `CalendarData`/`OutlookCalendarData` gain a `calendarIds?: string[]` field (default `['primary']` / `['default']`, i.e. unchanged behavior for existing installs). Both hooks now fetch events per selected calendar ID in parallel via `Promise.all`, merge, and sort by start time, instead of a single fixed-calendar request
- Event color resolution now falls back to the *source calendar's* color (Google's `calendarList.backgroundColor`, Outlook's `hexColor`) when an event has no explicit per-event color (`colorId`/category) — previously any event without its own color rendered in one flat default color regardless of which calendar it came from. Added via a new shared `calendarColor` field on the provider-agnostic `CalendarEvent` type (`shared/calendarEvent.types.ts`)
- `CalendarCore.tsx`'s shared `eventColor` callback prop changed signature from `(colorId?: string) => string` to `(event: CalendarEvent) => string`, since the calendar-color fallback needs the whole event, not just its `colorId`. Updated in both widgets — Outlook Calendar's own callback is otherwise behavior-unchanged
- No new OAuth scopes needed for either provider — Google's existing `calendar.readonly` already covers `calendarList`/non-primary calendars, and Outlook's existing `Calendars.Read` already covers `/me/calendars`/secondary calendars

## [1.6.10] — Glass effect slider, shadow intensity rework, settings UI consistency

- Added a **Glass Effect** slider, both global (Settings → Appearance) and per-widget (Local Style) — previously the frosted/blur look was implicitly tied to the Transparency slider and only rendered in light mode. Now controlled independently via its own `--widget-glass` CSS variable (default 0, no effect) and applies identically in dark mode too. The shared `backdrop-filter` formula also gained a `brightness()` term so the blur/saturate boost stays visible against dark mode's low-chroma backgrounds, which `saturate()` alone had nothing to work with
- Fixed Shadow Intensity doing nothing in light mode — the light-theme `box-shadow` was hardcoded and never actually read `--widget-shadow-opacity`, unlike the dark-theme rule. Both themes now use one identical formula
- Reworked the shadow curve: raw linear alpha was dominated by the top half of the slider's range, making 0-50% look nearly identical. Now eased via a squared `--widget-shadow-factor`, with a higher ceiling so cranking the slider reads as a real, visible shadow instead of a faint alpha shift
- Settings UI: found and fixed two controls that had drifted from the shared `SegmentedControl`/`Dropdown` components — BookmarkFolder's "Sort order" and Quicklinks' per-link icon-source picker were both hand-rolled native `<select>` elements at a smaller font-size than every other control in the same panel (this is also what fixed Quicklinks' icon-source popup ignoring dark mode, a bug noted but not fixed in 1.6.6). Added shared `.sg-form-input`/`.sg-form-hint` primitives (`Form.css`) and migrated the copy-pasted, hand-typed px values in BookmarkFolder, Quicklinks, Calendar (+ OutlookCalendar/OutlookMail), the five Obsidian widgets' shared chrome, Greeting, and Weather onto the same `rem`-based tokens the rest of the settings UI already used

## [1.6.9] — Continuous icon/text size sliders

- Quicklinks: adding a link no longer blindly prepends `https://` to any URL missing a recognized internal scheme — now any existing scheme (`file:`, `ftp:`, etc.) is left untouched, only bare domains/IPs get `https://` added. `file:` links now also open via the `browser.tabs` API path (like `about:`/`chrome:`) instead of a plain anchor, since Firefox blocks direct anchor navigation to `file://` from extension pages. `javascript:`/`data:` links are rejected with an alert
- `iconSize`/`textSize`/`fontSize` changed from a discrete `'S'|'M'|'L'` (or `'small'|'medium'|'large'`) string enum to a free `number` (px) across all 7 fields that used it: Quicklinks, BookmarkFolder (icon + text size), Notes, ObsidianCapture, ObsidianDaily, ObsidianNote, ObsidianRandom (font size). Each is now a continuous slider — icon size 18-48px (step 2, default 30px), text/font size 9-20px (step 1, default 13px) — instead of 3 fixed stops
- Icon box, favicon/image size, and grid/row tile width now scale proportionally from the raw px value (`iconImgPx`/`iconTilePx` helpers in `Quicklinks.tsx`/`BookmarkFolder.tsx`) instead of switching between 3 fixed CSS classes; removed the now-dead `.sg-*--small/medium/large` and `.sg-*--s/m/l` CSS across 7 widgets
- No migration for existing saved `'S'`/`'medium'`/etc. values — by design, per explicit decision. A widget with a legacy string still in storage renders with an invalid inline style until its slider is touched
- Built and then removed a `StepSlider` component (snapped discrete-option slider) — briefly used to convert the old segmented S/M/L pickers to sliders while keeping the enum data model, before the numeric-value approach above was chosen instead. Zero remaining consumers, so it and its CSS were deleted rather than left as unused shared code

## [1.6.8] — Widget settings row-gap fix, ESLint guard against future drift

- Clock, Greeting, and Weather's settings wrapper is `display: contents` (no box of its own), so unlike every other widget they got no `gap` between rows — only each row's own 4px padding, making their settings panels visibly more cramped than Calendar/BookmarkFolder/Quicklinks/Notes/Obsidian's 18px (padding + gap) row spacing. Moved `gap: 10px` onto the shared `.sg-widget-settings-content` wrapper (`WidgetContainer.css`) instead of each widget's own settings root, so `display: contents` widgets inherit it directly and widgets with their own flex+gap wrapper render as a single child here (no doubling up)
- `.sg-form-label` now sets `line-height: var(--sg-control-h)` — without an integer line-height, centering the label's fractional-height text box inside a row could round to a different device pixel depending on the row's cumulative Y-position, causing a 1px jitter between otherwise-identical rows (most visible on Switch rows)
- Added an ESLint rule (`eslint.config.mjs`, scoped to `src/components/widgets/**`) banning raw `<input type="range">` in favor of the shared `<SettingsSlider>` — runs in CI (`ci.yml`) on every push/PR, so a future widget reintroducing a bespoke slider (the root cause of this whole alignment audit) fails the build automatically instead of only surfacing in review. Calendar/OutlookCalendar/OutlookMail's existing raw sliders are grandfathered in with an explained `eslint-disable-next-line`, not yet migrated

## [1.6.7] — Widget settings row alignment consistency

- Every widget settings panel's horizontal inset was inconsistent — Quicklinks, BookmarkFolder, BookmarkSearch, Calendar (and OutlookCalendar/OutlookMail, which share its CSS), and Notes/Obsidian widgets each hardcoded their own `10px` padding, while Clock, Greeting, Weather, and the rest of the Obsidian widgets had **none at all**, leaving their rows (and nested Font/Display-settings sliders) flush against the panel edge. Moved this padding to one shared wrapper, `.sg-widget-settings-content` (`WidgetContainer.tsx`/`.css`), around every widget's `renderSettings` output, and stripped the now-redundant per-widget copies — matches the `10%` inset already used by the Local Style section below it
- Added `--sg-control-h` (`index.css:root`) as the single source of truth for every inline settings-row control's height. `SegmentedControl`, `SettingsSwitch`, and the `Dropdown` trigger (all shared, used by every widget) now size to it explicitly via `height` + `box-sizing: border-box`, instead of each approximating a similar-but-not-identical height through its own padding — this is why a row with a Dropdown (e.g. Timezone, Alignment) previously looked taller than a row with a Switch or SegmentedControl
- Extended the same `--sg-control-h` variable to the widgets with bespoke, non-shared controls: Calendar/OutlookCalendar/OutlookMail's "days ahead"/"max results" slider (`.sg-cal-slider-wrap`, which also lacked a `margin: 0` reset on the native range input) and BookmarkFolder's sort-order `<select>`
- Removed `.sg-cal-switch`/`.sg-cal-switch-thumb` from `Calendar.css` — a third, unused toggle-switch implementation, never referenced by any component, left over from before the shared `SettingsSwitch` existed

## [1.6.6] — Widget settings panel titles, Quicklinks link-table popout

- Dev Panel header now shows the running `APP_VERSION` next to the "DEV" label (`DevPanel.tsx`/`.css`), so the version being tested is visible without opening the Settings sidebar
- Widget settings panel title/tooltip changed from generic "Widget Settings" to "{{name}} Settings" (e.g. "Clock Settings", "Google Calendar Settings"), driven by the existing `WIDGET_TYPE_LABEL_KEYS` registry (`WidgetContainer.tsx`) — no new per-widget strings needed
- Bookmark Folder settings: the "Icon overrides" list now always starts collapsed when settings are opened (local component state, not persisted), so it no longer eats the panel on open
- Quicklinks settings: replaced the old expand/collapse-to-edit link list with a "Manage Links (N)" button that opens a second floating panel (`.sg-ql-links-panel`, 480px) next to the main settings panel, containing an always-open table (URL / Name / Icon / Badge / reorder+delete). The main settings panel stays at the shared 300px width used by every other widget — only the link table itself gets the extra room, via its own `useFloating` instance (same `flip`/`shift`/`offset` middleware as the main panel) so it repositions correctly near screen edges. Icon source changed from a 3-button segmented control to a `<select>` dropdown; selecting Custom URL/Upload reveals an extra row beneath that link for the corresponding input, as before
- Fixed the Icon-source `<select>`'s native dropdown popup rendering light/unreadable text in dark mode — the closed control inherits theme color, but the OS-rendered option list ignores `color: inherit` unless each `<option>` gets an explicit background/color
- Shared thin-scrollbar utility (`.sg-scroll-thin`, added in 1.6.4) also applied to the shared `.sg-widget-float-panel`, so every widget's settings window gets the thin scrollbar, not just the widgets that had it applied individually

## [1.6.4] — Shared thin-scrollbar utility, clock date color fix

- Several widgets' scroll containers had no scrollbar styling, so Chromium fell back to its default bulky arrow scrollbar while Firefox already rendered a thin overlay one (e.g. Quicklinks' `.sg-ql-links`, BookmarkFolder's `.sg-bf-body`/`.sg-bf-settings`/`.sg-bf-fp-tree`). `SettingsPanel.css` had its own one-off fix already, gated behind `@supports selector(::-webkit-scrollbar)`
- Replaced all of these with one shared `.sg-scroll-thin` utility class in `index.css` (`scrollbar-width`/`scrollbar-color` for Firefox, `::-webkit-scrollbar*` for Chromium — no `@supports` guard, matching the already-working unguarded pattern in `BookmarkSearch.css`/`ObsidianSearch.css`) instead of duplicating the rule per widget. Applied to Quicklinks, the global Settings panel, and all three BookmarkFolder scroll regions
- Clock widget: `.sg-clock-date` used `var(--text-muted)` while `.sg-clock-time` used `var(--text)`, so with the default (non-custom) color the date line rendered dim gray next to a bright white time. Only matched when a custom text color was set, since that's applied inline to both elements identically. Changed `.sg-clock-date` to `var(--text)` so both match by default too

## [1.6.2] — Fix preview crash when closing OAuth widget settings

- `useMsAuth.ts` and `useGoogleAuth.ts` unconditionally called `import('webextension-polyfill')` and registered a `storage.local.onChanged` listener on mount, with no `isExtension` guard (unlike every other storage adapter, e.g. `storage.ts`). On the public browser preview (`docs/preview/`) there is no `chrome.runtime`, so the polyfill's own top-level guard throws; with no `ErrorBoundary` anywhere in the app, that surfaced as the whole React tree unmounting — a black screen recoverable only by a hard refresh — specifically when closing the Outlook Mail, Outlook Calendar, or Google Calendar widget's settings panel, the only three widgets using these hooks. Not reproducible in the installed extension, where `chrome.runtime.id` is always present. Both hooks now gate the polyfill import behind `isExtension`, matching the rest of the codebase

## [1.6.1] — Firefox homepage override

- Firefox manifest (`src/manifest.firefox.json`) gains `chrome_settings_overrides.homepage: "newtab.html"`. Previously only `chrome_url_overrides.newtab` was set, so StartGrid took over every *subsequent* new tab but not the very first window on browser launch (which showed Firefox's default start page) — Firefox treats the initial-window slot and the new-tab slot as separate preferences (`about:preferences#home` → "Neue Fenster" vs. "Neue Tabs"), and only the latter is driven by `chrome_url_overrides`. `chrome_settings_overrides.homepage` is the key Firefox actually reads for the "New Windows" dropdown; no extra permission is required. Chrome is unaffected — `manifest.chrome.json` already covered both slots via its own override key and was left unchanged

## [1.6.0] — Obsidian widgets, onboarding tour, GPL-3.0 licensing

### Obsidian widgets
- Added five optional **Obsidian** widgets — Quick Capture, Daily Note, Pinned Note, Vault Search, and Random Note — reading and writing notes in a local vault. Nothing about a vault ever leaves the device: no relay, no proxy, no Worker involvement, unlike the Google/Microsoft integrations
- Two transports, deliberately. **Quick Capture** defaults to Obsidian's `obsidian://` link scheme, which needs no permission and no plugin — the OS resolves the scheme — so it works with zero setup beyond a vault name. Its drawback is that it raises and focuses the Obsidian window, which is the opposite of what a capture box on a new tab page is for, so Quick Capture silently appends over REST instead whenever a connection is configured. The other four widgets are REST-only, since the URI scheme cannot read anything back
- The REST transport targets the [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin's **opt-in HTTP server on 27123, not its HTTPS default on 27124**. The default serves a self-signed certificate; `fetch()` rejects it and an extension has no way to click through a certificate warning, so HTTPS is unreachable without the user manually trusting the cert. Loopback HTTP is still a secure context (`127.0.0.1` is "potentially trustworthy"), so there is no mixed-content problem, and the plugin's bearer token is what actually guards the server. The base URL remains user-editable for anyone who has trusted the certificate
- Both manifests gain `optional_host_permissions: ["http://127.0.0.1/*"]`. This is a **separate top-level key** — MV3 rejects host match patterns inside `optional_permissions`, which is unchanged at `["bookmarks"]` — and match patterns carry no port component, so the entry already covers 27123 and cannot be narrowed to it. Nothing is granted at install; the prompt fires only on "Allow local access". `localhost` and `127.0.0.1` are distinct match patterns, so `127.0.0.1` is used consistently in both the manifest and every request URL. Granting the permission also exempts the requests from CORS, which matters because the plugin documents no CORS behaviour of its own
- `src/lib/obsidianMarkdown.ts` parses Markdown to **tokens**, which `MarkdownView.tsx` renders as React elements — never through `dangerouslySetInnerHTML`. Vaults routinely contain clipped web pages, and rendering that as HTML would hand arbitrary saved content script execution on the new tab page. Covers only what the widgets display (headings, emphasis, code, links, `[[wikilinks]]`, `#tags`, task lines, quotes, rules); a full CommonMark dependency would have been ~35 KB for syntax no widget shows
- Daily Note resolves its path from a **template** (`Daily/{{date:YYYY-MM-DD}}.md`) rather than a plugin endpoint. The `/periodic/` endpoints live in a separate companion plugin ("Local REST API - Periodic Notes"), so depending on them would have added a second required install; a template also works against any vault layout and over the URI transport, which has no endpoints at all
- Ticking a checkbox in Daily Note re-reads the note, confirms the target line still matches the rendered text byte-for-byte, and only then writes the file back with that one character flipped. If it no longer matches, the note was edited in Obsidian since the last refresh — the write is **refused and the widget reloads** rather than clobbering that edit. The plugin's PATCH endpoint was avoided because targeting one arbitrary list item through it is fragile
- Random Note needs a flat file list, which the REST API only exposes one directory at a time. `src/lib/obsidianIndex.ts` walks the vault breadth-first and caches the result in `browser.storage.local` for six hours, capped at 300 directory requests and depth 8 — a large vault degrades to a partial index, surfaced in the widget, rather than spinning. Only file *paths* are cached, never note contents. A new tab page opens dozens of times a day and must not re-walk a vault on each one
- The connection record (server URL, API key, vault name) is global rather than per-widget, stored in `browser.storage.local` and **never `storage.sync`** — the same rule OAuth tokens follow. An API key must not ride Chrome/Mozilla Sync to other machines, and a vault path is meaningless on a machine without that vault. `useObsidian.ts` mirrors `useMsAuth.ts`, including a `storage.onChanged` listener so connecting in one widget's settings unblocks every other mounted Obsidian widget, plus `permissions.onAdded`/`onRemoved` so a permission revoked from the browser's own add-on manager falls back cleanly instead of failing every fetch
- Quick Capture persists its unsent draft to `storage.local`, since a new tab page remounts constantly and an unsent thought shouldn't die with it
- All five widgets ship mock data behind the existing `isExtension` check and "Preview data" badge, so the public browser preview at `docs/preview/` keeps working where `chrome` is undefined and there is no vault
- Privacy policy (`docs/privacy.html`): added an "Obsidian widgets (your notes)" section and a permissions-table row for the loopback host permission. The blanket claim *"StartGrid requests no host permissions"* was **factually wrong** the moment that permission could be granted, and is now scoped to "no host permission for any website". Firefox's `data_collection_permissions` is deliberately left unchanged: those categories describe data an extension *collects or transmits*, and vault content is neither

### Widget onboarding tour
- Added a 9-step onboarding tour (`WidgetTour.tsx`) covering the full add/arrange/remove-widget flow: welcome, the Settings icon (clicking Next opens the sidebar), a "Settings Sidebar" confirmation slide, adding a widget, unlocking the grid (clicking Next enables edit mode), an "Edit mode is on" confirmation slide, moving/resizing, editing/removing, and a wrap-up. Auto-triggers once widgets have loaded
- Each targeted step spotlights the real on-screen control it's describing — a fixed-position ring tracks the element's live bounding rect (polled + resize/scroll-aware) and dims the rest of the viewport via an oversized box-shadow, rather than making the user hunt for it while reading
- The lock/theme-toggle control cluster is normally hover-only (`.sg-controls:hover`); the tour force-reveals it (icons, pill background, and the center-alignment variant's width expansion) during the "unlock the grid" step so it's visible without a real mouseover. Copy also mentions hovering and the Ctrl+E shortcut, since the tour won't always be there to force it
- Skipping marks the tour seen and shows a one-off follow-up notice pointing at Settings → "Show tutorial again" (placed above Import/Export); finishing normally closes directly. Tour entry/exit always resets to a clean state — Settings Sidebar closed, edit mode off — regardless of what the tour toggled on mid-flow or what the user had open before triggering it. Restarting via "Show tutorial again" always starts at step 1, even if the previous run ended on the skip notice
- First-run gating differs by build target: the real installed extension shows the tour once ever (`widgetTourSeen`), surviving later version updates; the `docs/preview` demo (same bundle, served as a plain web page — see `sync-preview.js`) instead re-triggers after every version bump (`widgetTourSeenVersion` vs. `APP_VERSION`), so returning visitors see what's new
- The floating "Add Widget" button (`Grid.tsx`) now also shows whenever the Settings Sidebar is open or pinned, not just during edit mode — it no longer requires unlocking the grid first to add a widget
- i18n: all new copy added to both `en.ts` and `de.ts`

### Licensing and homepage
- StartGrid is now released under **GPL-3.0-or-later**. Until now the project had no license at all, which under default copyright meant "all rights reserved" — the source was readable on GitHub but nobody could legally reuse, modify, or redistribute it, so the public repo granted no rights beyond GitHub's own fork button. GPL-3.0 was chosen over a permissive license specifically because a browser extension is trivially repackageable: it allows redistribution but requires any redistributed derivative to publish its source under the same terms, which removes the incentive to fork it into a closed-source clone with ads or tracking
- Added `LICENSE` (verbatim GPL-3.0 text), `"license": "GPL-3.0-or-later"` in `package.json`, and a License section in `README.md`
- Trademark reservation added to `README.md` — the GPL covers the code only; the "StartGrid" name, logo, and icon set are expressly reserved under GPL-3.0 §7(e), so a fork must strip the branding and ship under its own name. The reservation lives in the README rather than in `LICENSE`, which is kept byte-for-byte verbatim: modifying the GPL text would create ambiguity about which license is actually being offered
- `z_package-source.bat` now includes `LICENSE` in the AMO source archive — GPL requires the license text to accompany distributed source, and the source upload was previously omitting it
- Homepage (`docs/index.html`): the promo tile from `store-assets/` is now the hero header (replacing the small logo row), cropped from 440×280 to 440×160 so it reads as a banner rather than the square-ish tile the store listing requires — the logo and wordmark keep their original size, only the surrounding grid is trimmed. The grid is also offset by half a cell (`background-position: 20px 20px`) so no gridline sits flush against an edge; trimming alone couldn't fix this, since the repeating gradient is anchored to the box's top-left and a line therefore always lands on x=0 and y=0 regardless of the box size. The store links use Mozilla's and Google's official badge artwork instead of hand-drawn icons. All three buttons (Firefox, Chrome Web Store, Try in browser) share one 206×58 box so they line up; the vendor badges keep their own aspect ratio centred inside it, since stretching them to equal width would violate both brands' guidelines
- Homepage footer expanded from three inline links into three columns (Get StartGrid / Project / More), and both "Web Preview" links now point at `./preview/index.html` rather than `./preview/` — the directory form relies on the server's index resolution and shows a folder listing when the page is opened locally over `file://`
- Added `scripts/render-promo.js` (`pnpm render:promo`), which renders the `store-assets/` promo tiles from their `.html` source to `.png` via headless Chrome, replacing the manual screenshot step — the PNGs previously had to be recaptured by hand whenever the HTML changed, so they could silently drift out of sync. Each tile is clipped to its `.tile` element rather than the viewport, and the element's rendered size is cross-checked against the dimensions in the filename, so a tile whose CSS no longer matches its declared size fails loudly instead of producing an off-size asset the stores would reject. Adds `puppeteer` as a devDependency only; nothing in the extension build or the shipped artifact uses it
- Added `pnpm-workspace.yaml` with `allowBuilds: puppeteer: true`. pnpm blocks dependency build scripts by default, which silently skips puppeteer's Chromium download and leaves `render:promo` unable to launch a browser. pnpm 11 no longer reads these settings from package.json's `pnpm` field, so they live in this file
- Comment in `src/components/Background/providers/gradient.ts` corrected: it claimed the provider was "ported from" another app's gradient plugin, but the code is two template literals producing `linear-gradient()`/`radial-gradient()` — convergent, not copied. Reworded to describe the implementation on its own terms; the rationale for omitting a "random gradient from a third-party endpoint" option is unchanged

### Privacy policy
- Privacy policy corrected where it still described the Google Calendar and Outlook widgets as "in development and hidden behind an internal developer option — not yet enabled for general use". That stopped being true in 1.3.0, which un-gated all three; the policy had not been updated to match

## [1.3.0] — Calendar/mail widgets enabled, privacy policy corrections
- Google Calendar widget is no longer gated behind Developer Options — Google's OAuth verification of the `calendar.readonly` scope was approved, so it's now available to all users from the Add-Widget menu
- Outlook Calendar and Outlook Mail widgets are also no longer gated behind Developer Options, now available to all users
- Added the same "Preview data (browser preview)" badge already shown on Bookmark Folder to Google Calendar, Outlook Calendar, Outlook Mail, and Bookmark Search, so mock data is clearly labeled in the browser-preview build for all widgets that use it, not just one
- Privacy policy (`docs/privacy.html`) corrected: the Google OAuth token-exchange step is relayed through the Cloudflare Worker (which attaches a server-side `client_secret`), not sent directly browser-to-Google as previously stated; added a full disclosure section for the Microsoft/Outlook integration (scopes, storage, security, deletion), which existed in code but wasn't documented; added explicit "Data security" and "Data retention and deletion" sections addressing gaps flagged by Google Trust & Safety's automated privacy policy review
- Homepage and privacy policy now hosted on the custom domain `vinzenz-dev.de` (via a separate `vinzenz-san.github.io` user-page repo with GitHub Pages custom domain configured), replacing the `github.io` URLs Google's OAuth verification rejected as not domain-ownership-verifiable

## [1.2.0] — Browser preview
- Added a `build:preview` script that builds the Chrome target and copies it into `docs/preview/`, publishable via GitHub Pages with no separate hosting step — visitors can try the widget grid at a URL with no install required
- Fixed a crash that made this (and likely the existing `preview-server.js` dev workflow) impossible: `permissions.ts` statically imported `webextension-polyfill`, which throws at module-evaluation time — not just when its APIs are called — whenever no `chrome`/`browser` global exists, crashing the whole bundle before React could mount in any non-extension context
- New-install defaults changed: background is now Bing's daily wallpaper instead of a solid color (fetched directly from a community mirror, not through the Cloudflare Worker, so no API-quota cost), widget transparency defaults to 10% instead of 0%, and the Settings section of the settings panel now starts collapsed like every other section
- Bookmark Folder now shows a small "preview data" badge on its main tile when running outside the extension (mock data was already used, but the only indication was buried in the widget's settings panel)
- App version now shown in the settings panel header, injected at build time from `package.json`

## [1.1.7] — Build hygiene: reproducible builds, no key in bundle
- Build: `APP_NASA_API_KEY` is now injected only when no proxy URL is configured. `astronomy.ts` derives `MEDIA_PROXY_URL` through a `.replace()` call, so the minifier couldn't fold it to a constant, couldn't prove the direct-to-`api.nasa.gov` fallback dead, and kept that branch — meaning the key shipped as a string literal in every build even though the proxy is the path that actually runs. It's a rate-limit identifier rather than a credential, so this is hygiene rather than an incident, but the fallback is only reachable without a proxy, so the key now only ships in that case
- Build: documented the required `cp .env.example .env` step in the README. It was missing, so anyone following the build instructions — including AMO reviewers verifying the submitted package — produced a different artifact: `APP_MEDIA_PROXY_URL` is inlined at build time, and without it the Unsplash provider disables itself and NASA APOD drops to `DEMO_KEY`. Together with the change above, a production build now reproduces exactly from the public `.env.example`, with no private value needed
- Added an `engines` field (`node >=20`, `pnpm >=9`) matching the versions the README documents

## [1.1.6] — Privacy audit: token-safe backups, Worker CORS, policy corrections
- Security: settings backup/export no longer writes OAuth tokens. `exportBackup()` read `storage.local` wholesale, so `sg_google_auth`/`sg_ms_auth` (access **and** refresh tokens) were serialized into the downloaded JSON in plain text — a live credential sitting in the Downloads folder, readable by any local process, which contradicted the policy's guarantee that tokens stay in sandboxed extension storage. Both keys are now filtered on export and on import
- Security: the Cloudflare Worker no longer answers every caller with `Access-Control-Allow-Origin: *` — any web page could spend the Unsplash/NASA keys it holds, or POST to `/google-token`//`/ms-token` from a visitor's browser. It now matches the caller's `Origin` against an allowlist: Firefox's `moz-extension://<uuid>` by pattern (it's regenerated per install, so the scheme is all there is to match), Chrome's pinned extension ID exactly, plus `vinzenz-dev.de` and localhost. `ALLOWED_ORIGIN` is now a comma-separated list replacing the Chrome entry rather than a single fixed value, so it can't lock out a browser whose origin can't be predicted. Unrecognised origins get a 403 naming the origin; callers with no `Origin` at all are served without CORS headers, since an origin check only ever constrains browsers
- Privacy policy (`docs/privacy.html`) corrected against a line-by-line audit of the source, which found several claims the code didn't support: bookmark and quicklink **hostnames do leave the browser** — every rendered item requests a favicon from `icons.duckduckgo.com`, with `www.google.com/s2/favicons` and `unavatar.io` as Quicklinks fallbacks — against a policy that said bookmark data is "never transmitted anywhere"; layout and widget settings live in `browser.storage.sync` (so quicklink URLs, weather coordinates and "Cloud"-mode note text replicate through the user's browser account), not the `storage.local` the policy described; the OAuth token exchange is not a one-off, since every refresh sends the refresh token through the Worker; calendar and mail data are held in memory only and never written to storage, so the retention/deletion section described data that doesn't exist; Bing wallpapers come from the community mirror `bing.npanuhin.me`, not Microsoft; and the policy still cited a `tabs` permission dropped back in 1.1.2
- Privacy policy additions: a permission/purpose table (`storage`, `identity`, optional `bookmarks`), Factory Reset documented as a deletion route, the token-free backup export documented as a protection mechanism, honest wording for best-effort Google revocation, and an explicit note that Microsoft has no per-application revoke endpoint (with the account page link). Addresses both points raised in Google Trust & Safety's review — retention/deletion policy, and data protection mechanisms for sensitive data

## [1.1.5] — CI: typecheck + lint gate
- Added `pnpm typecheck` (`tsc --noEmit`) and `pnpm lint` (ESLint, flat config) scripts, plus a GitHub Actions workflow (`.github/workflows/ci.yml`) running typecheck, lint, and both browser builds on every push/PR — previously `tsc` had never actually been run against this codebase (rspack transpiles without type-checking)
- Fixed a real Rules-of-Hooks violation in `WidgetContainer.tsx`: `useFloating`/`useEffect` were called after the "unknown widget type" early return, so a widget with a type missing from the registry (e.g. a stale/removed type in stored data) would skip those hooks entirely — moved them above the early return
- Fixed ~13 other pre-existing type errors surfaced by the first `tsc` run: missing `@types/chrome`/`@types/firefox-webext-browser`, a null-safety gap in `useUnsplash.ts`'s rotation timer, a stale dead type-narrowing check in `SettingsContext.tsx` (comparing against `'left'`/`'right'`, values `SettingsButtonPosition` never actually has), a `Dropdown.tsx` outside-click check that couldn't call `.contains()` on a floating-ui virtual-element type, and a few discriminated-union cast points in the widget registry/context
- Cleaned up dead code the type/lint gate surfaced: unused `luminance()` helper, unused `useRef` import, a few stale `eslint-disable` comments, and useless variable initializers always overwritten before being read

## [1.1.4] — Drop background-image host_permissions entirely
- Removed the remaining `host_permissions` (`*.nasa.gov`, `*.unsplash.com`, `*.bing.com`, `bing.npanuhin.me`) along with the background-script `FETCH_EXTERNAL_IMAGE` relay and the `background.ts` entry point altogether — the extension no longer has a background context at all
- These existed solely to support `useBackgroundContrast`, which sampled the live background image's pixels on a `<canvas>` to auto-pick a light/dark settings-gear icon. That feature is removed: the settings gear now uses the same fixed, theme-aware translucent chip background as the lock and theme-toggle buttons, which needs no permissions and works unconditionally — plain CSS `url()`, no pixel sampling

## [1.1.3] — Reduced permissions footprint
- Removed unnecessary `host_permissions`: `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `api.open-meteo.com`, `geocoding-api.open-meteo.com` — all confirmed CORS-permissive for direct fetch, so the permission was declared but never actually needed (Google OAuth is opened via `identity.launchWebAuthFlow`, not fetched directly; token exchange and Calendar API calls already work without it). Kept `*.nasa.gov`/`*.unsplash.com`/`*.bing.com`/`bing.npanuhin.me`, which the `FETCH_EXTERNAL_IMAGE` background relay genuinely needs for CORS-blocked image bytes.
- `bookmarks` moved from a required to an `optional_permissions` entry (Firefox: `bookmarksInfo` moved to optional data collection too) — Bookmark Folder/Search widgets now request it at runtime via `browser.permissions.request()` the first time they're used, with a "Grant access" prompt in place of silently falling back to sample data
- Fixed extension-environment detection (`isExtensionEnv`) to key off `browser.runtime.id` instead of `chrome.permissions`, which isn't reliably exposed by Firefox's `chrome.*` compatibility shim — the old check silently misdetected Firefox and could get stuck showing mock bookmarks with no permission prompt

## [1.1.2] — Store submission fixes
- Removed the unused `tabs` permission from both manifests (Chrome Web Store rejected 1.1.1 for excessive permissions — `tabs.create`/`tabs.update` don't require it since the code never reads back `Tab.url`/`title`/`favIconUrl`)
- Build: replaced PowerShell `Compress-Archive` with a Node `archiver`-based packaging script (`scripts/package-zip.js`, `pnpm package:firefox`/`package:chrome`/`package:chrome-store`) — `Compress-Archive` was writing backslash path separators into the zip, which AMO's linter rejects as invalid file names

## [1.1.1] — Outlook monthly view, Chrome ID stability
- Outlook Calendar widget gains a monthly grid view (view toggle, first-day-of-week setting), at parity with the Google Calendar widget — the agenda/monthly rendering core was extracted into a shared `widgets/shared/CalendarCore.tsx` used by both widgets
- Google Calendar widget renamed to "Google Calendar" in the Add Widget menu for consistency with "Outlook Calendar"
- Build: Chrome extension ID is now pinned via a manifest `key` for local unpacked testing (keeps the Google/Microsoft OAuth redirect URI stable across rebuilds), while a new `build:chrome-store` script produces a key-free artifact for the actual Chrome Web Store upload (the Store rejects manifests containing `key`)

## [1.1.0] — Outlook integration
- New Outlook Calendar widget (Microsoft Graph `calendarView`, `Calendars.Read`) — agenda view, reuses the Google Calendar widget's visual chrome
- New Outlook Mail widget (Microsoft Graph `messages`, `Mail.Read`) — inbox list with unread filter
- Microsoft OAuth: authorization code + PKCE flow (`src/lib/msAuth.ts`), token exchange proxied through the same Cloudflare Worker as Google's (`/ms-token` route), mirroring the Google Sign-In implementation
- Both widgets are `devOnly` pending end-to-end verification of the connect flow, same gate as the Google Calendar widget — `Mail.Read`/`Calendars.Read` don't require tenant admin consent, so this is expected to be short-lived

## [1.0.0] — First public release
- Build: version now sourced solely from `package.json`, injected into both manifests at build time
- Build: production builds now minify and drop source maps (`mode` was hardcoded to `development`)
- Security: Google OAuth switched from implicit flow to authorization code + PKCE with refresh tokens, so Google Sign-In no longer expires hourly; token exchange proxied through the existing Cloudflare Worker (Google's Web application client type requires `client_secret` at exchange, which can't live in extension code)
- Removed the Gmail widget: `gmail.readonly` is a Google-classified "restricted" scope requiring an annual paid CASA security assessment, not worth it for this project's scale
- The Calendar widget (Google Sign-In, `calendar.readonly`) is temporarily hidden from the normal Add Widget menu pending OAuth verification — reachable via a hidden Developer Options unlock (tap the app title 7× in Settings) for testing
- Privacy policy updated to disclose bookmarks/tabs access and the Weather widget's geolocation-to-Open-Meteo data flow, previously undocumented
- Widgets: Greeting gains top/bottom alignment (5 options total); Clock gains a full 5-option alignment control (previously none)
- Widgets: new Padding slider in the shared Display Settings panel (Clock, Greeting), 0-48px, default 12px

## [0.11.0] — Release prep: branding, hosting, OAuth submission
- GitHub Pages marketing site, branding icons
- Pin fixed Chrome extension ID via manifest key
- Google Search Console domain verification
- Fix Google token revocation (GET → required POST)
- Homepage copy clarified for OAuth review; meta description/OG tags added

## [0.10.0] — Security: proxied API keys
- Cloudflare Worker proxy for Unsplash and NASA APOD requests
- Removed user-facing Unsplash API key input (no longer needed client-side)

## [0.9.0] — New widgets & polish
- Greeting and Weather widgets
- Clock timezone support, Formatting Settings accordion
- Calendar event details popover, configurable first day of week
- Bookmark search readability fix under low widget opacity

## [0.8.0] — Grid & layout system
- Configurable grid resolution with layout-preserving rescale
- Grid glow overlay, Compact Grid, symmetric widget gaps
- Drag-and-drop cell targeting and Quicklinks/BookmarkFolder alignment fixes
- Floating "Add Widget" button, per-bookmark icon overrides

## [0.7.0] — i18n foundation
- Full localization pass across Settings sidebar, widget registry, Background/Widgets panels

## [0.6.0] — Background provider architecture
- Provider architecture (Unsplash, Bing, Astronomy/APOD, Wikimedia) with env-based API keys
- Adaptive color system unifying widget styling across providers

## [0.5.0] — Settings sidebar redesign
- Settings panel redesigned to full-height, pinnable sidebar with unified architecture
- Theme system rework: local-theme, glow, animated theme toggle, floating control cluster

## [0.4.0] — Bookmark widgets overhaul
- Bookmarks replaced with BookmarkExplorer, then split into Folder and Search widgets
- Custom modal replacing native `window.confirm` for factory reset

## [0.3.0] — Storage architecture
- Hybrid sync storage architecture with developer storage diagnostics
- Profile backup/restore/factory reset

## [0.2.0] — Widget architecture
- Centralized widget registry and atomic form primitives
- Decoupled widget layout into smart floating panel; modular widget header system

## [0.1.0] — Initial scaffold
- Project structure and Google OAuth integration
