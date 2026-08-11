/** Shared rich-text styling block — a "Font Settings" panel,
 *  reusable across any widget by giving that widget's data type an optional
 *  `fontSettings?: FontSettings` field. Resolved into CSS via
 *  lib/fontStyle.ts's resolveFontStyle(). */
export interface FontSettings {
  fontFamily?:       string;
  fontWeight?:        number;  // undefined = Default/inherit
  italic?:             boolean;
  underline?:          boolean;
  color?:              string;
  useAccentColor?:     boolean; // when true, color follows the app's live accent color instead of `color`
  textOutline?:        boolean;
  textOutlineStyle?:   'basic' | 'advanced'; // basic = fixed-size text-shadow; advanced = -webkit-text-stroke
  textOutlineColor?:   string;
  textOutlineSize?:    number;  // advanced only
}

/** Shared "Display Settings" — Font Size / Scale / Rotation
 *  (Position and Custom CSS Class are deliberately not part of this app's
 *  version). Reusable the same way as FontSettings: any widget data type
 *  adds `displaySettings?: DisplaySettings`. Resolved via
 *  lib/displayStyle.ts's resolveDisplayStyle(). */
export interface DisplaySettings {
  fontSize?: number; // px, default 42 — the widget's primary text size
  scale?:    number; // default 1
  rotation?: number; // degrees, default 0
  padding?:  number; // px, default 12 — overrides the widget's own CSS padding
}

export interface ClockData {
  format: '24h' | '12h';
  showSeconds: boolean;
  showDate: boolean;
  /** IANA timezone id (e.g. 'Europe/Berlin'), or 'local' for the system timezone. Default 'local'. */
  timezone?: string;
  /** left/right/center control horizontal placement; top/bottom control
   *  vertical placement (the widget's flex-direction is column, so these
   *  map to align-items vs justify-content respectively). Default 'center'. */
  alignment?: WidgetAlignment;
  fontSettings?: FontSettings;
  displaySettings?: DisplaySettings;
  /** Let the rendered text spill past the widget's own box instead of being
   *  clipped — useful for a large clock font. Default false. */
  allowOverflow?: boolean;
}

export interface QuickLink {
  id: string;
  url: string;
  title?: string;
  customIcon?: string;
  iconSource?: 'auto' | 'custom-url' | 'upload';
  showTitle: boolean;
  showWhiteBadge?: boolean;
}

export type WidgetAlignment = 'left' | 'center' | 'right' | 'top' | 'bottom';

export interface QuicklinksData {
  links: QuickLink[];
  layout: 'grid' | 'list';
  iconSize?: number; // px, 18-48, default 30
  showTitles?: boolean;
  textSize?: number; // px, 9-20, default 13
  alignment?: WidgetAlignment; // default 'left'
}

export type BookmarkSortMode = 'original' | 'foldersFirst' | 'alphabetical';

export interface BookmarkIconOverride {
  iconSource?:     'auto' | 'custom-url' | 'upload';
  customIcon?:     string;
  showWhiteBadge?: boolean;
}

export interface BookmarksData {
  rootFolderId?: string;
  folderTitle?:  string;
  iconSize?:     number;  // px, 18-48, default 30
  showTitles?:   boolean; // default true
  textSize?:     number;  // px, 9-20, default 13
  layout?:       'list' | 'grid';               // default 'list'
  alignment?:    WidgetAlignment;                // default 'left'
  sortingMode?:  BookmarkSortMode;
  /** Per-bookmark icon overrides, keyed by bookmark id. Scoped to the direct
   *  children of rootFolderId only — cleared whenever rootFolderId changes,
   *  and self-pruned of stale ids whenever the root folder's children are
   *  fetched and a previously-overridden id is no longer present. */
  iconOverrides?: Record<string, BookmarkIconOverride>;
}

export interface BookmarkSearchData {
  maxResults: number;
  /** When no bookmark matches the query, offer a "Search Google" fallback
   *  (click, or Enter). Off by default — sends the query to Google. */
  googleFallback?: boolean;
}

export interface CalendarData {
  maxDays: number;
  showAllDay: boolean;
  viewMode?: 'agenda' | 'monthly';
}

export interface OutlookCalendarData {
  maxDays: number;
  showAllDay: boolean;
  viewMode?: 'agenda' | 'monthly';
  firstDayOfWeek?: 0 | 1;
  calendarIds?: string[]; // Graph calendar IDs to pull events from; 'default' is this widget's alias for /me/calendarView. Default ['default']
}

export interface OutlookMailData {
  maxResults: number;      // 1–25, default 8
  showUnreadOnly?: boolean; // default false
}

export interface NotesData {
  content:      string;
  fontSize?:    number; // px, 9-20, default 13
  storageMode?: 'local' | 'synced';
}

/** Quick Capture — the one Obsidian widget that works with no host permission,
 *  falling back to the `obsidian://` URI scheme when no REST connection is
 *  configured. Connection details themselves are global (storage.local key
 *  `sg_obsidian_conn`), not per-widget — only the capture target lives here. */
export interface ObsidianCaptureData {
  /** Vault name, required for the URI transport only. */
  vaultName?:       string;
  /** 'daily' resolves dailyTemplate against today; 'file' uses targetPath. */
  targetMode?:      'daily' | 'file';
  targetPath?:      string;
  dailyTemplate?:   string;
  /** Prefix each captured line with a `- ` bullet. Default true. */
  bulletPrefix?:    boolean;
  prependTimestamp?: boolean;
  /** Time format for prependTimestamp, in the token subset of lib/obsidianPath. */
  timestampFormat?: string;
  clearAfterSend?:  boolean;
  fontSize?:        number; // px, 9-20, default 13
}

/** Daily Note — reads today's note over the REST transport. The path comes
 *  from a template rather than a plugin endpoint so it works against any vault
 *  layout; see lib/obsidianPath.ts. */
export interface ObsidianDailyData {
  pathTemplate?:   string;
  /** Render only the content beneath this heading. Empty = the whole note. */
  sectionHeading?: string;
  /** Drop everything that isn't a checkbox line. */
  tasksOnly?:      boolean;
  /** Show already-ticked tasks. Default true. */
  showChecked?:    boolean;
  maxLines?:       number;
  fontSize?:       number; // px, 9-20, default 13
}

/** Pinned Note — one note rendered read-only. Editing deliberately stays in
 *  Obsidian; ObsidianCaptureData covers the write case. */
export interface ObsidianNoteData {
  path?:           string;
  sectionHeading?: string;
  maxLines?:       number;
  /** Auto-refresh interval in minutes; 0/undefined = only on load. */
  refreshMinutes?: number;
  fontSize?:       number; // px, 9-20, default 13
}

export interface ObsidianSearchData {
  maxResults?:    number;
  /** Characters of surrounding text the plugin returns per hit. */
  contextLength?: number;
}

export interface ObsidianRandomData {
  /** Vault-relative folder names to skip, e.g. "Templates", "Archive". */
  excludeFolders?: string[];
  showExcerpt?:    boolean;
  excerptLines?:   number;
  /** 'load' picks a fresh note on every new tab; 'manual' only on the button. */
  refreshOn?:      'load' | 'manual';
  fontSize?:       number; // px, 9-20, default 13
}

export interface PlaceholderData {
  title?: string;
}

// Purely a layout filler — transparent/non-interactive in view mode, no
// content or settings of its own. Distinct from PlaceholderData (a
// dev-only "empty slot" debug widget that always shows an icon/title/hint).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SpacerData {}

export interface GreetingData {
  userName?: string;
  useCustomQuote?: boolean;
  customQuote?: string;
  alignment?: WidgetAlignment; // default 'left'
  fontSettings?: FontSettings;
  displaySettings?: DisplaySettings;
  /** Let the rendered text spill past the widget's own box instead of being
   *  clipped — useful for a large greeting font. Default false. */
  allowOverflow?: boolean;
  /** Force the greeting onto a single line instead of wrapping — pairs with
   *  allowOverflow so a long line can spill sideways instead of breaking.
   *  Default false. */
  noWrap?: boolean;
}

export interface WeatherData {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  units?: 'metric' | 'imperial'; // default 'metric'
  showFeelsLike?: boolean;       // default true
  showLocationName?: boolean;    // default true
  alignment?: WidgetAlignment;   // default 'left'
  displaySettings?: DisplaySettings;
  /** Let the rendered content spill past the widget's own box instead of
   *  being clipped. Default false. */
  allowOverflow?: boolean;
  /** Open a detailed forecast page in a new tab when the widget is clicked.
   *  Default false. */
  openForecastOnClick?: boolean;
  /** Which site to open for the detailed forecast. Default 'google'. */
  forecastProvider?: 'google' | 'windy' | 'wetteronline';
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoData {
  source?: 'local' | 'google';  // default 'local'
  items: TodoItem[];            // only used when source is 'local'
  googleTaskListId?: string;    // only used when source is 'google'
  hideCompleted?: boolean;      // default false
}

export interface CurrencyTickerData {
  baseCurrency?: string;       // ISO 4217 code, default 'EUR'
  targetCurrencies?: string[]; // ISO 4217 codes, default ['USD', 'GBP']
  refreshIntervalMin?: number; // default 60
}

export interface RainRadarData {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;      // Leaflet zoom level, default 6
  opacity?: number;   // radar overlay opacity 0-100, default 70
  /** Base map style. 'auto' follows the app's light/dark theme (CARTO
   *  Positron/Dark Matter); 'voyager' is CARTO's colorful terrain style
   *  (green land, no light/dark variant). Default 'auto'. */
  mapStyle?: 'auto' | 'voyager';
}

export interface RssFeedData {
  feedUrl?: string;
  /** Cached from the feed's own <title>/<feed><title> on the last successful
   *  fetch — used for the widget's dynamic title (resolveDynamicTitle in
   *  registry.tsx), not re-derived from feedUrl. */
  feedTitle?: string;
  maxItems?: number;           // default 8
  showDescription?: boolean;   // default false
  refreshIntervalMin?: number; // default 30
}

// Maps each widget type string to its strongly-typed data interface.
export interface WidgetDataMap {
  clock:           ClockData;
  quicklinks:      QuicklinksData;
  bookmarks:       BookmarksData;
  bookmarkSearch:  BookmarkSearchData;
  calendar:        CalendarData;
  outlookCalendar: OutlookCalendarData;
  outlookMail:     OutlookMailData;
  notes:           NotesData;
  obsidianCapture: ObsidianCaptureData;
  obsidianDaily:   ObsidianDailyData;
  obsidianNote:    ObsidianNoteData;
  obsidianSearch:  ObsidianSearchData;
  obsidianRandom:  ObsidianRandomData;
  greeting:        GreetingData;
  weather:         WeatherData;
  rssFeed:         RssFeedData;
  todoList:        TodoData;
  currencyTicker:  CurrencyTickerData;
  rainRadar:       RainRadarData;
  placeholder:     PlaceholderData;
  'invisible-spacer': SpacerData;
}

export type WidgetType = keyof WidgetDataMap;

interface WidgetBase {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
  bgColor?: string;
  bgColorScheme?: 'dark' | 'light'; // which theme was active when bgColor was picked — see getAdaptiveColor (colorUtils.ts)
  bgPresetId?: string;
  bgOpacity?: number;
  bgDim?: number;
  localOverrideEnabled?: boolean;
  /** @deprecated read-only; use bgGradientIntensity instead */
  localGradientOverride?: boolean;
  bgGradientIntensity?: number;  // 0-100; replaces localGradientOverride
  bgShadow?: number;             // 0-100; local shadow intensity override
  bgGlass?: number;              // 0-100; local glass/blur intensity override
  /** Explicit per-widget theme override. Unset (auto) follows the global colorScheme. */
  localColorScheme?: 'light' | 'dark';
  showCustomTitle?: boolean;
  customTitle?: string;
}

// Discriminated union — TypeScript narrows `data` automatically when `type` is checked.
export type Widget =
  | (WidgetBase & { type: 'clock';          data: ClockData })
  | (WidgetBase & { type: 'quicklinks';     data: QuicklinksData })
  | (WidgetBase & { type: 'bookmarks';      data: BookmarksData })
  | (WidgetBase & { type: 'bookmarkSearch'; data: BookmarkSearchData })
  | (WidgetBase & { type: 'calendar';       data: CalendarData })
  | (WidgetBase & { type: 'outlookCalendar'; data: OutlookCalendarData })
  | (WidgetBase & { type: 'outlookMail';     data: OutlookMailData })
  | (WidgetBase & { type: 'notes';          data: NotesData })
  | (WidgetBase & { type: 'obsidianCapture'; data: ObsidianCaptureData })
  | (WidgetBase & { type: 'obsidianDaily';   data: ObsidianDailyData })
  | (WidgetBase & { type: 'obsidianNote';    data: ObsidianNoteData })
  | (WidgetBase & { type: 'obsidianSearch';  data: ObsidianSearchData })
  | (WidgetBase & { type: 'obsidianRandom';  data: ObsidianRandomData })
  | (WidgetBase & { type: 'greeting';       data: GreetingData })
  | (WidgetBase & { type: 'weather';        data: WeatherData })
  | (WidgetBase & { type: 'rssFeed';        data: RssFeedData })
  | (WidgetBase & { type: 'todoList';       data: TodoData })
  | (WidgetBase & { type: 'currencyTicker'; data: CurrencyTickerData })
  | (WidgetBase & { type: 'rainRadar';      data: RainRadarData })
  | (WidgetBase & { type: 'placeholder';    data: PlaceholderData })
  | (WidgetBase & { type: 'invisible-spacer'; data: SpacerData });
