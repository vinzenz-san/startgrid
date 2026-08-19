# StartGrid Components Audit — 2026-08-19

Scope: `src/components/` (alle Unterordner, inkl. `src/components/widgets/`)

Zwei unabhängige Read-only-Reviews: **code-quality** und **security-reviewer**, mit Fokus auf:
1. Re-Render-Schleifen / fehlende `useEffect`-Cleanups bei Intervallen/Timern
2. Event-Listener-Handling in React-Komponenten
3. CSP-/DOM-Injection-Risiken bei dynamischem Rendering
4. Ob die verbliebenen LOW-Punkte aus dem Core-Pass (`themeTransition`-Overlay-Muster, Layering-Inversion) auch hier auftreten

**Kernergebnis vorab**: Ein **HIGH**-Sicherheitsfund (gespeicherte `javascript:`-URL-XSS via Quicklinks-Edit-Feld + ungeprüfter Backup-Import) — höchster Schweregrad in beiden Audit-Läufen bisher. Ansonsten ist die Codebasis in diesem Scope sauber: keine `dangerouslySetInnerHTML`/`innerHTML`/`eval`, kein `postMessage`, starke Listener-Cleanup-Disziplin.

---

## 1. Code-Quality Audit

### Memory Leaks / Cleanup

#### 1.1 [MEDIUM] [✅ RESOLVED] `ExcalidrawEmbed.tsx` — async effect ohne catch, Widget bleibt dauerhaft im Loading-State hängen
`src/components/widgets/shared/ExcalidrawEmbed.tsx:42-68`

```ts
async function run() {
  ...
  const { paths } = await getVaultIndex();       // Zeile 52 — kein try/catch
  ...
  const result = await fetchExcalidrawSvg(notePath);
  ...
}
run();
return () => { cancelled = true; };
```

`getVaultIndex()` (`src/lib/obsidianIndex.ts:108`) macht REST-Calls gegen eine lokale Obsidian-Instanz ohne eigenes try/catch. Schlägt der Call fehl (Server offline, Timeout, Non-JSON-Response), rejected `run()`'s Promise ohne `.catch`, `setState` wird nie über `{ status: 'loading' }` hinaus aufgerufen. Das Embed bleibt bei jedem Render dieser Notiz dauerhaft im Loading-Platzhalter hängen, bis das gesamte Widget remounted.

**Das ist exakt dasselbe Muster wie das im Core-Pass gefundene `themeTransition.ts`-Problem** ("visuellen Effekt starten, nur im Happy Path aufräumen") — es manifestiert sich hier, im Gegensatz zu allen Schwester-Widgets (`useObsidianNote.ts`, `ObsidianSearch.tsx`, `VaultNotePicker.tsx`), die ihre Fetch-Pipelines alle in `try/catch/finally` wrappen und einen expliziten Error-State setzen.

**Fix**: `run()`-Body in `try { ... } catch { if (!cancelled) setState({ status: 'unavailable', reason: 'HTTP_ERROR' }); }` wrappen.

#### 1.2 [LOW] `RainRadar.tsx:333` — Fallback-`setTimeout` beim Frame-Swap nicht in Cleanup gecleart
```ts
setTimeout(swap, SWAP_FALLBACK_MS);
```
Durch einen `loadTokenRef`-Check in `swap` geschützt (kein sichtbarer Bug, no-op nach Unmount), aber nie im Effect-Cleanup erfasst/gecleart — kleiner dangling Timer pro Frame-Swap, hält Closure über Leaflet-Layer bis er feuert. Nicht user-sichtbar; Hygiene-Fix, da jeder andere Timer in der Datei gecleart wird.

#### 1.3 [LOW] `SettingsPanel.tsx:69-78` — `titleTapTimerRef` nie beim Unmount gecleart
```ts
titleTapTimerRef.current = setTimeout(() => { titleTapCountRef.current = 0; }, 2000);
```
Kein `useEffect(() => () => clearTimeout(...), [])`. Harmlos (setzt nur einen Ref, keinen State — kein React-Warning), aber inkonsistent mit den Nachbar-Timern derselben Datei, die alle aufgeräumt werden.

### Event Listeners

Keine unmatched `addEventListener`/`removeEventListener`-Paare in irgendeinem `useEffect` gefunden. Alle `document`/`window`-Listener (WeatherEffect, WidgetTour, ElementInspector, DevPanel, Dropdown, CommandPalette, CustomColorPicker Outside-Click, CalendarCore, BookmarkSearch, ObsidianSearch, WidgetContainer, SettingsPanel Resize) werden korrekt im jeweiligen Effect-Cleanup entfernt.

**[LOW-INFO]** Drag-Handler-Listener außerhalb von `useEffect` registriert (selbst-entfernend, aber ohne Unmount-Sicherheitsnetz):
- `TodoList.tsx:207-254`, `Quicklinks.tsx:440-483`, `CustomColorPicker.tsx:62-90` — alle self-remove bei `pointerup`/`pointercancel`. Kein aktiver Leak (der `document`-Listener existiert weiter, auch nach Unmount der Komponente), nur eine Abweichung vom sonstigen Effect-basierten Listener-Muster der Codebase. Kein Action Item.

### Type Safety

Codebase ist strikt: nur 2 `as unknown as`-Casts in ganz `src/components/`, beide eng gescoped und kommentiert (`DevPanel.tsx:90-92`, `registry.tsx:349` — Letzterer der bewusst dokumentierte "one cast total"-Type-Erasure-Punkt, durch per-Entry `satisfies`-Checks abgesichert). Kein `any`, kein `@ts-ignore`/`@ts-expect-error`. Keine Findings.

### Modularity / Duplication / Layering

#### 1.4 [MEDIUM] [✅ RESOLVED] Layering-Inversion bestätigt: `lib/`, `hooks/`, `contexts/` importieren aus `src/components/`
```
src/lib/gridPresets.ts:4     import { WIDGET_REGISTRY } from '../components/widgets/registry';
src/lib/gridUtils.ts:2       import { WIDGET_REGISTRY } from '../components/widgets/registry';
src/lib/widgetGuards.ts:2    import { WIDGET_REGISTRY } from '../components/widgets/registry';
src/hooks/useRssFeed.ts:5    import { MOCK_FEED_ITEMS, MOCK_FEED_TITLE } from '../components/widgets/RssFeed/rssFeed.mock';
src/hooks/useBing.ts:4       import { fetchBingImage } from '../components/Background/providers/bing';
src/hooks/useAstronomy.ts:4  import { fetchApodImage } from '../components/Background/providers/astronomy';
src/contexts/BackgroundContext.tsx:7 import { resolveBackgroundCss } from '../components/Background/providers';
```
Bestätigt das im Core-Pass geflaggte Muster auch von der `src/components/`-Seite aus. `registry.tsx` und `Background/providers/` sind architektonisch "Leaf"-UI-Registrierungsmodule, aber `lib/`/`hooks/`/`contexts/` — von denen `components/` selbst abhängt — greifen zurück nach oben. Kein aktiver Circular Import gefunden (`registry.tsx` importiert nicht aus `gridUtils`/`gridPresets`/`widgetGuards`), aber die Richtung ist invertiert und macht `registry.tsx` zu einem De-facto-Zweitsitz für Domain-Logik, die eigentlich in `lib/`/`hooks/` gehört.
- **Konkretes Risiko**: Jede künftige Registry-Änderung, die etwas aus `lib/gridUtils.ts` braucht (plausibel, da beide dieselben Widget-Shapes behandeln), erzeugt einen echten Import-Zyklus.
- **Fix-Richtung**: `WIDGET_REGISTRY`'s Konsum-Bedarf (Default-Size/Data-Lookups) in ein schlankes `lib/widgetDefaults.ts` auslagern, das sowohl `registry.tsx` als auch `gridUtils.ts`/`gridPresets.ts`/`widgetGuards.ts` importieren können. Gleiche Behandlung für Mock-Data- und Background-Provider-Importe aus `hooks/`/`contexts/`.

**Keine Widget-zu-Widget-Importe** — kein `widgets/X`, das direkt aus `widgets/Y` importiert. Alles Cross-Widget-Sharing läuft über `widgets/shared/` oder `lib/`/`hooks/`/`contexts/`. Gute Modulgrenzen-Disziplin, kein Finding.

`registry.tsx` (385 Zeilen) ist groß, aber eine flache, deklarative Datentabelle (ein Eintrag pro Widget-Typ), keine God-Function — für ihre Rolle als einziger Widget-Registrierungspunkt angemessen strukturiert. Kein Finding.

### Dead Code

Keine gefunden.

### Summary Table

| File | Line(s) | Category | Issue |
|---|---|---|---|
| `src/components/widgets/shared/ExcalidrawEmbed.tsx` | 42-68 | Memory/Cleanup (async-stuck-state, = `themeTransition`-Muster) [✅ RESOLVED] | `run()` ohne try/catch; Widget bleibt bei Fehler dauerhaft im Loading-State |
| `src/lib/gridPresets.ts`, `gridUtils.ts`, `widgetGuards.ts` | 4 / 2 / 2 | Modularity (Layering-Inversion) | `lib/` importiert `WIDGET_REGISTRY` aus `components/widgets/registry.tsx` — **weiterhin offen, nicht Teil dieses Fixes** (registry.tsx bleibt bewusst in components/, siehe Resolution Log) |
| `src/hooks/useRssFeed.ts`, `useBing.ts`, `useAstronomy.ts`; `src/contexts/BackgroundContext.tsx` | 5 / 4 / 4 / 7 | Modularity (Layering-Inversion) [✅ RESOLVED] | `hooks/`/`contexts/` importierten Mock-Data/Provider-Fetcher aus `components/...` |
| `src/components/widgets/RainRadar/RainRadar.tsx` | 333 | Memory/Cleanup (minor) | Fallback-`setTimeout` nicht gecleart (harmlos, token-geschützt) |
| `src/components/Layout/SettingsPanel.tsx` | 69-78 | Memory/Cleanup (minor) | `titleTapTimerRef`-Timer nie gecleart (harmlos) |
| `src/components/widgets/TodoList/TodoList.tsx`, `Quicklinks/Quicklinks.tsx`, `shared/CustomColorPicker.tsx` | 207-254 / 440-483 / 62-90 | Event Listeners (Info) | Drag-Listener außerhalb `useEffect`, self-removing, kein aktiver Leak |

---

## 2. Security Review

Keine `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `eval`, `new Function` irgendwo in diesem Scope (Full-Tree-Grep verifiziert). Obsidian-Markdown-/Excalidraw-Rendering vermeidet HTML-String-Sinks bewusst (`MarkdownView.tsx`, `ExcalidrawEmbed.tsx`), SVGs erreichen das DOM nur via `<img src="data:...">` (`ExcalidrawEmbed.tsx:84`) — bestätigt den Fund des Core-Passes weiterhin. Kein `postMessage`/`message`-Listener irgendwo in `src/components/`.

### 2.1 [HIGH] [✅ RESOLVED] Quicklinks-Edit-Feld umgeht URL-Scheme-Validierung — gespeicherte `javascript:`-XSS via Backup-Import
**Datei:** `src/components/widgets/Quicklinks/Quicklinks.tsx:298-301`
```tsx
<input className="sg-ql-input" ... value={link.url} onChange={e => updateLink(link.id, { url: e.target.value })}
```
Das Edit-Feld für **bestehende** Links patcht `link.url` bei jedem Tastendruck direkt, ohne `onBlur`-Normalisierung und ohne `normalizeUrl`-Aufruf (im Gegensatz zum *Add*-Pfad, `Quicklinks.tsx:215-221`, der `normalizeUrl` aufruft und `javascript:`/`data:` ablehnt). Der gespeicherte Wert wird später ungeschützt gerendert (`Quicklinks.tsx:154`):
```tsx
<a className="sg-ql-link" ... href={link.url} ...>
```
ohne `target`/`rel`, ohne `INTERNAL_URL`-Gate (deckt nur `about|chrome|edge|moz-extension|file` ab, nicht `javascript:`), ohne Scheme-Revalidierung beim Klick. Ein `link.url` von `javascript:...` rendert als lebendiger Anchor, der beim Klick im New-Tab-Page-Kontext ausgeführt wird — mit Extension-Privilegien (`browser.tabs`, `browser.bookmarks`, OAuth-Calls).

**Exploit-Pfad:** Widget-Daten (inkl. `QuicklinksData.links`) werden beim Backup-Restore komplett wiederhergestellt, ohne Feld-Sanitization — `src/components/Layout/BackupRestore.tsx:147-167`'s `importBackup()` prüft nur die Envelope-Form (`isValidEnvelope`, Zeile 114-123: nur "sync/local sind Objekte"), dann `writeAllStorage(parsed.sync, ...)` direkt. Eine bösartige "geteilte Backup"-JSON (z. B. verteilt als "mein cooles StartGrid-Setup, importier das!") kann `{ url: "javascript:...", ... }` in einem Quicklinks-Eintrag platzieren; der Klick des Opfers auf die eigene New-Tab-Page führt Angreifer-JS mit Extension-Privilegien aus.

**Fix:** Jede `link.url` sowohl beim Edit-Feld-Commit (neues `onBlur` mit `normalizeUrl`) als auch defensiv beim Rendern vor dem Setzen von `href` prüfen; zusätzlich Widget-Feldwerte beim Backup-Import validieren/sanitizen, nicht nur die äußere Envelope-Form.

### 2.2 [MEDIUM] [✅ RESOLVED] BookmarkFolder/BookmarkSearch's `openUrl` umgeht die gemeinsame Scheme-Allowlist
**Datei:** `src/components/widgets/BookmarkFolder/useBookmarkFolder.ts:90-97`
```ts
async function openUrl(url: string): Promise<void> {
  if (isExtensionEnv) {
    const browser = await getBrowser();
    await browser.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
```
Aufgerufen aus `BookmarkSearch.tsx:258` (`bookmarks.openUrl(url)`) für den primären Klick-Pfad. Im Gegensatz zu jedem anderen Widget-Link-Öffnen-Pfad (RssFeed, Weather, TodoList, Quicklinks — alle über `src/lib/openLink.ts`'s `openLink()` mit `isAllowedLinkUrl`-Check gegen `http:/https:/chrome:/chrome-extension:/moz-extension:`), öffnet dieser Pfad `bookmark.url` **ohne jede Scheme-Prüfung**. `middleClickHandlers(node.url)` (`BookmarkSearch.tsx:63`) geht *doch* über den validierten Pfad — nur der primäre Linksklick umgeht ihn, eine Inkonsistenz zwischen beiden Handlern für denselben Link.

**Exploit-Szenario:** echte Browser-Bookmarks sind normalerweise Scheme-restriktiert, können aber aus anderen Quellen importiert/synced werden; `data:`-URLs werden von `browser.tabs.create` nicht geblockt und könnten eine Angreifer-kontrollierte `data:text/html`-Phishing-Seite in einem neuen Tab öffnen. Geringe Wahrscheinlichkeit, aber null Defense-in-Depth im Vergleich zum Rest der Codebase.

**Fix:** `useBookmarkFolder.ts`'s `openUrl` über `src/lib/openLink.ts`'s `openLink()` routen (oder `isAllowedLinkUrl` exportieren/wiederverwenden) statt `browser.tabs.create`/`window.open` direkt aufzurufen.

### 2.3 [LOW] Quicklinks "Internal URL"-Pfad erlaubt `file:`-Scheme-Same-Tab-Navigation ohne Import-Gate
**Datei:** `src/components/widgets/Quicklinks/Quicklinks.tsx:63,70-76,141-142`
```ts
const INTERNAL_URL = /^(about|chrome|edge|moz-extension|file):/i;
```
`normalizeUrl` lehnt nur `javascript:`/`data:` ab, nicht `file:` — ein `file:///...`-Quicklink passiert die Add-Validierung, wird als "internal" klassifiziert und via direktem `browser.tabs.update({ url })` geöffnet (umgeht `openLink`'s Allowlist, die `file:` ohnehin nicht enthält). Beabsichtigtes Feature (lokale Datei-Shortcuts), aber kombiniert mit Finding 2.1 könnte ein bösartiges Backup einen `file://`-Quicklink auf einen sensiblen lokalen Pfad platzieren, den der Nutzer unwissentlich anklickt.

**Fix:** niedrige Priorität (erfordert weiterhin Nutzerklick, kein Code-Execution/Exfiltration allein) — aber explizite Bestätigung sinnvoll (oder `file:` aus `INTERNAL_URL` ausschließen), falls die Backup-Import-Sanitization (2.1) nicht ohnehin behoben wird.

### 2.4 [INFO] Calendar/Outlook `href`-Sinks nutzen unvalidierte, aber server-generierte URLs
- `src/components/widgets/shared/CalendarCore.tsx:136`: `href={event.htmlLink}` (Google Calendar API Feld)
- `src/components/widgets/OutlookMail/OutlookMail.tsx:85`: `href={message.webLink}` (Microsoft Graph API Feld)

Beide rendern direkt in `<a href>` mit `target="_blank" rel="noreferrer"`, ohne Scheme-Validierung. Aktuell nicht ausnutzbar: beide Felder werden von Googles/Microsofts eigenen APIs generiert (nicht von Angreifer/Event-Organisator als Freitext kontrollierbar). Nur zur Vollständigkeit geflaggt — kein Fix nötig, außer diese APIs würden je über untrusted Intermediäre geproxied.

### 2.5 Keine Findings — RSS, Obsidian Markdown, Excalidraw
- `RssFeed.tsx:160-163`: `item.title`/`item.description` rendern als reiner JSX-Text, nie als HTML. `item.link` öffnet nur über validiertes `openLink()`.
- `MarkdownView.tsx:20-25`: Vault-Note-Links laufen über `safeHref()` (`lib/obsidianMarkdown.ts:41-44`), das Schemes whitelistet und `javascript:` zu Plain-Text degradiert.
- `ExcalidrawEmbed.tsx:81-86`: SVGs erreichen das DOM nur via `<img src={state.dataUri}>`, nie Inline-SVG/DOM-Injection.

### 2.6 Keine Findings — Event Listeners / `postMessage`
Kein `addEventListener('message', ...)`, `onmessage`, `postMessage` irgendwo in `src/components/`.

### Summary Table

| File | Line(s) | Severity | Issue |
|---|---|---|---|
| `src/components/widgets/Quicklinks/Quicklinks.tsx` | 154, 298-301 | **High** [✅ RESOLVED] | Edit-Feld umgeht `normalizeUrl`; ungeschütztes `href={link.url}` ermöglicht gespeicherte `javascript:`-XSS, erreichbar via unsanitiziertem Backup-Import |
| `src/components/Layout/BackupRestore.tsx` | 114-123, 147-167 | **High (Enabler)** [✅ RESOLVED] | `importBackup()` validiert nur die Envelope-Form, nicht Feld-Inhalte (z. B. Quicklink-URLs) vor dem Storage-Write |
| `src/components/widgets/BookmarkFolder/useBookmarkFolder.ts` | 90-97 | Medium [✅ RESOLVED] | `openUrl()` ruft `browser.tabs.create`/`window.open` direkt auf, umgeht die gemeinsame `isAllowedLinkUrl`-Allowlist |
| `src/components/widgets/BookmarkSearch/BookmarkSearch.tsx` | 258, 271 | Medium [✅ RESOLVED] | Primärer Klick-Pfad nutzt unvalidiertes `bookmarks.openUrl`, inkonsistent zum eigenen (validierten) Middle-Click-Handler |
| `src/components/widgets/Quicklinks/Quicklinks.tsx` | 63, 70-76 | Low | `file:`-Scheme als "internal" akzeptiert, Same-Tab-Navigation ohne zusätzliche Bestätigung |
| `src/components/widgets/shared/CalendarCore.tsx` | 136 | Info | `href={event.htmlLink}` unvalidiert, aber API-server-generiert |
| `src/components/widgets/OutlookMail/OutlookMail.tsx` | 85 | Info | `href={message.webLink}` unvalidiert, aber API-server-generiert |

---

## Priorisierte Gesamtliste

1. **[HIGH]** [✅ RESOLVED — 2026-08-19] §2.1 + §2.2(Enabler) — Quicklinks gespeicherte `javascript:`-XSS via ungeprüftem Edit-Feld + Backup-Import ohne Feld-Sanitization
2. **[MEDIUM]** [✅ RESOLVED — 2026-08-19] §2.2 — BookmarkFolder/BookmarkSearch `openUrl` ohne Scheme-Check (primärer Klick-Pfad)
3. **[MEDIUM]** [✅ RESOLVED — 2026-08-19] §1.1 — `ExcalidrawEmbed.tsx` async-stuck-loading-state (dasselbe Muster wie `themeTransition.ts` im Core-Pass)
4. **[MEDIUM]** [✅ RESOLVED (teilweise) — 2026-08-19] §1.4 — Layering-Inversion bestätigt auch von `src/components/`-Seite (`lib/`/`hooks/`/`contexts/` importieren aus `components/`) — die `hooks/`/`contexts/`-Seite (RssFeed-Mock, Bing/Astronomy-Fetcher, Background-Provider-Registry) ist behoben; die `lib/gridPresets.ts`/`gridUtils.ts`/`widgetGuards.ts` → `components/widgets/registry.tsx`-Inversion bleibt bestehen (siehe Resolution Log)
5. **[LOW]** §2.3 — Quicklinks `file:`-Scheme ohne Extra-Bestätigung
6. **[LOW]** §1.2, §1.3 — nicht gecleante, aber harmlose Timer (`RainRadar.tsx`, `SettingsPanel.tsx`)
7. **[INFO]** §2.4, §2.5, §2.6 — keine Findings / nur zur Vollständigkeit

**Bezug zu den Core-Pass-LOW-Punkten (Punkt 4 der Aufgabenstellung):**
- `themeTransition`-Overlay-Muster → **manifestiert sich** in `ExcalidrawEmbed.tsx` (§1.1)
- Layering-Inversion → **bestätigt/verstärkt** von der `components/`-Seite (§1.4) — dieselbe Ursache wie im Core-Pass (`lib/gridPresets.ts`, `gridUtils.ts`, `widgetGuards.ts` importieren `WIDGET_REGISTRY` aus `components/widgets/registry.tsx`), plus zusätzlich `hooks/useRssFeed.ts`, `useBing.ts`, `useAstronomy.ts` und `contexts/BackgroundContext.tsx`, die neu identifiziert wurden

---

## Resolution Log — 2026-08-19 (code-fixer pass, HIGH-XSS-Fix, gezielt beauftragt)

Umfang dieses Fix-Durchlaufs: **ausschließlich §2.1/§2.2(Enabler) [HIGH]**. Alle anderen Findings (MEDIUM: BookmarkFolder/BookmarkSearch-Scheme-Check, ExcalidrawEmbed-Stuck-State, Layering-Inversion-Refactor; LOW/INFO: RainRadar-/SettingsPanel-Timer, `file:`-Bestätigung) sind bewusst **nicht** Teil dieses Durchlaufs und bleiben offen — nicht beauftragt.

`pnpm typecheck` (`tsc --noEmit -p tsconfig.json`): **0 Fehler**, unabhängig verifiziert.

### §2.1 [HIGH] Quicklinks-Edit-Feld — RESOLVED
`src/components/widgets/Quicklinks/Quicklinks.tsx`:
- Edit-Feld für bestehende Links hat jetzt einen `onBlur`-Handler, der `normalizeUrl` aufruft — bei ungültigem Schema wird die URL geleert und ein Warnhinweis gezeigt (wiederverwendet `widget.quicklinks.unsupportedUrlScheme`), bei gültigem, aber unnormalisiertem Input wird normalisiert.
- Zusätzlicher **Render-time-Defensiv-Guard** in `LinkItem`: neue `isDangerous`-Prüfung (via neu exportierter `isDangerousUrlScheme()` in `src/lib/urlUtils.ts`) rendert einen `link.url` mit gefährlichem Schema (z. B. aus einem alten, unsanitizierten Backup oder einem anderen synced Gerät) nie als klickbaren `<a href>`, sondern als inerten `<button>` mit Warnhinweis — greift auch dann, wenn eine bösartige URL auf anderem Weg als über das UI-Edit-Feld in den Storage gelangt wäre.

### §2.2(Enabler) [HIGH] Backup-Import — RESOLVED
- `src/lib/openLink.ts` — `isAllowedLinkUrl` war bereits exportiert (keine Änderung nötig).
- `src/components/Layout/BackupRestore.tsx` — die rekursive `assertNoDangerousUrls()`-Sanitizer-Funktion (mit `data:image/`-Ausnahme für Icon-Felder, sonst strikte Prüfung via `isAllowedLinkUrl` gegen jeden String mit explizitem URL-Schema) war im Code bereits vorhanden, wurde aber **nie aufgerufen** — das war der eigentliche Bug. Fix: zwei fehlende Aufrufe `assertNoDangerousUrls(parsed.sync)` / `assertNoDangerousUrls(parsed.local)` in `importBackup()` ergänzt, direkt nach der `isValidEnvelope`-Prüfung und vor `writeAllStorage(...)` — verifiziert per Read (Zeilen 182-187).

### Files edited
`src/lib/urlUtils.ts`, `src/components/widgets/Quicklinks/Quicklinks.tsx`, `src/components/Layout/BackupRestore.tsx` (`src/lib/openLink.ts` bereits korrekt, keine Änderung nötig)

### Nicht behoben (außerhalb des beauftragten Umfangs, weiterhin offen)
- §2.2 [MEDIUM] ~~`BookmarkFolder`/`BookmarkSearch` primärer Klick-Pfad ohne Scheme-Allowlist~~ → **jetzt behoben, siehe unten**
- §1.1 [MEDIUM] ~~`ExcalidrawEmbed.tsx` Stuck-Loading-State (kein try/catch)~~ → **jetzt behoben, siehe unten**
- §1.4 [MEDIUM] ~~Layering-Inversion (`useRssFeed`, `useBing`, `useAstronomy`, `BackgroundContext`)~~ → **jetzt größtenteils behoben, siehe unten** (Registry-Seite bleibt offen)
- §2.3 [LOW] Quicklinks `file:`-Scheme ohne Bestätigung — weiterhin offen
- §1.2, §1.3 [LOW] nicht gecleante Timer (`RainRadar.tsx`, `SettingsPanel.tsx`) — weiterhin offen

---

## Resolution Log — 2026-08-19 (code-fixer pass #2, verbliebene MEDIUM-Punkte)

Umfang: §2.2 (Bookmark-Scheme-Check), §1.1 (ExcalidrawEmbed Stuck-State), §1.4 (Layering-Inversion, `hooks/`/`contexts/`-Seite).

`pnpm typecheck` (`tsc --noEmit -p tsconfig.json`): **0 Fehler**, unabhängig verifiziert. Keine verwaisten Importpfade der alten Speicherorte gefunden (Grep über gesamtes `src/`).

### §2.2 [MEDIUM] Bookmark-Scheme-Check — RESOLVED
`src/components/widgets/BookmarkFolder/useBookmarkFolder.ts` — `openUrl()` delegiert jetzt an `openLink()` aus `lib/openLink.ts` statt `browser.tabs.create`/`window.open` direkt aufzurufen (verifiziert per Read: `await openLink(url);`). Deckt automatisch sowohl `BookmarkFolder` als auch `BookmarkSearch.tsx`'s `openBookmark()`/`searchWeb()` ab, da beide durch `bookmarks.openUrl()` laufen — kein separater Fix in `BookmarkSearch.tsx` nötig.

### §1.1 [MEDIUM] ExcalidrawEmbed Stuck-State — RESOLVED
`src/components/widgets/shared/ExcalidrawEmbed.tsx` — der Netzwerk-Teil von `run()` (Vault-Index laden, SVG fetchen) ist jetzt in try/catch gewrappt; ein Fehler setzt `{ status: 'unavailable', reason: 'HTTP_ERROR' }` statt das Widget dauerhaft im Loading-Zustand hängen zu lassen. `cancelled`-Guard bleibt auf jedem `setState`-Aufruf erhalten. Verifiziert per Read.

### §1.4 [MEDIUM] Layering-Inversion — TEILWEISE RESOLVED
Drei Verschiebungen von reiner Logik aus `src/components/` nach `src/lib/`:
- `src/components/widgets/RssFeed/rssFeed.mock.ts` → **`src/lib/rssFeedMock.ts`**; `useRssFeed.ts` importiert jetzt von dort.
- `fetchApodImage`/`ApodImageResult` aus `components/Background/providers/astronomy.ts` → **`src/lib/astronomyApi.ts`** (mirrored an `lib/bingApi.ts`'s Stil); `astronomyProvider`/`FALLBACK_CSS` blieben am ursprünglichen Ort (jetzt `lib/backgroundProviders/astronomy.ts`, siehe unten), da sie reine CSS-Resolution sind und `fetchApodImage` nicht zurückimportieren müssen. `useAstronomy.ts` importiert jetzt aus `lib/astronomyApi`.
- Gesamter Ordner `src/components/Background/providers/` → **`src/lib/backgroundProviders/`** (alle 10 Dateien: `index.ts`, `astronomy.ts`, `bing.ts`, `color.ts`, `custom.ts`, `gradient.ts`, `online.ts`, `preset.ts`, `unsplash.ts`, `wikimedia.ts` — keine enthielt JSX/React, alle sauber verschoben). Importer aktualisiert: `contexts/BackgroundContext.tsx`, `components/Background/BackgroundEditor.tsx`, und `hooks/useBing.ts` (zusätzlich per Grep gefunden, nicht ursprünglich in der Fund-Liste). Alter Ordner `src/components/Background/providers/` gelöscht, verifiziert leer/nicht mehr vorhanden.

**Verifiziert:** `pnpm typecheck` sauber; `src/components/Background/` enthält jetzt nur noch `Background.tsx`/`BackgroundEditor.tsx`/`UnsplashSettings.tsx` + CSS; `src/lib/backgroundProviders/` und `src/lib/rssFeedMock.ts` existieren; keine Grep-Treffer mehr auf alte Pfade.

**Bewusst nicht Teil dieses Fixes** — die andere Hälfte der ursprünglich gefundenen Layering-Inversion (`src/lib/gridPresets.ts`, `gridUtils.ts`, `widgetGuards.ts` importieren `WIDGET_REGISTRY` aus `src/components/widgets/registry.tsx`) wurde nicht beauftragt und bleibt offen. `registry.tsx` ist umfangreicher (385 Zeilen, UI-Registrierungspunkt für alle Widget-Komponenten selbst) und ein Split würde eine größere Umstrukturierung erfordern als die hier durchgeführten reinen Datei-Verschiebungen — sollte als eigene Aufgabe geplant werden, falls gewünscht.

### Files created/moved/deleted/edited
**Neu:** `src/lib/rssFeedMock.ts`, `src/lib/astronomyApi.ts`, `src/lib/backgroundProviders/*.ts` (10 Dateien)
**Gelöscht:** `src/components/widgets/RssFeed/rssFeed.mock.ts`, `src/components/Background/providers/` (gesamter Ordner)
**Editiert:** `src/components/widgets/BookmarkFolder/useBookmarkFolder.ts`, `src/components/widgets/shared/ExcalidrawEmbed.tsx`, `src/hooks/useRssFeed.ts`, `src/hooks/useAstronomy.ts`, `src/hooks/useBing.ts`, `src/contexts/BackgroundContext.tsx`, `src/components/Background/BackgroundEditor.tsx`
