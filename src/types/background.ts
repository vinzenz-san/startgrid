// ─── Shared across all modes ───────────────────────────────────────────────
export type BackgroundPosition =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BackgroundShared {
  luminosity?: number;       // 0–200, default 100 (mid-point = normal brightness)
  // Fields below are shared optionals used by multiple modes; kept here so
  // BackgroundEditor can read them without mode-narrowing until editor panels
  // are split per-provider (future step).
  customColor?: string;      // the hex a user picked via the Solid Color panel's "Custom Color" swatch
  customColorScheme?: 'dark' | 'light'; // which theme was active when customColor was picked — see getAdaptiveColor (colorUtils.ts)
  letterboxColor?: string;  // fill color for empty space around a 'custom' image when scaleToFit is on
  // Modular display controls — apply to the active background layer
  // regardless of provider (see Background.tsx).
  dateMode?: 'today' | 'custom'; // default 'today'
  customDate?: string;           // YYYY-MM-DD, default current date
  blur?: number;                 // 0–100 (px), default 0
  scaleToFit?: boolean;          // default true — object-fit: contain vs cover
  position?: BackgroundPosition; // default 'center'
  autoDimNight?: boolean;        // default false
  nightStart?: string;           // HH:MM (24h), default '22:00'
  nightEnd?: string;             // HH:MM (24h), default '05:00'
}

// ─── Per-mode discriminated configs ────────────────────────────────────────
export interface PresetConfig extends BackgroundShared {
  mode: 'preset';
  value: string;             // preset id
}

export interface ColorConfig extends BackgroundShared {
  mode: 'color' | 'gradient';
  value: string;             // CSS gradient string or hex
}

export interface CustomImageConfig extends BackgroundShared {
  mode: 'custom';
  value: string;             // unused; kept for storage shape compat
}

export interface UnsplashConfig extends BackgroundShared {
  mode: 'unsplash';
  value: string;             // unused placeholder (keeps storage shape uniform)
  query?: string;            // free-text search term
  topics?: string[];         // Unsplash topic ids
  collectionId?: string;     // Unsplash collection id, used when source === 'collection'
  source?: 'official' | 'topics' | 'search' | 'collection';
  rotationInterval?: number; // seconds between photo changes; 0 = fetch fresh every new tab, default 900
  showAttribution?: boolean; // default true
  // attribution data cached alongside the image url
  photographerName?: string;
  photographerUrl?: string;
  unsplashPhotoUrl?: string;
}

export interface BingConfig extends BackgroundShared {
  mode: 'bing';
  value: string; // unused; kept for storage shape uniformity with other modes
  showTitle?: boolean; // default false — overlay Bing's daily wallpaper title
}

// ─── Placeholder providers (not yet implemented) ───────────────────────────
export interface AstronomyConfig extends BackgroundShared {
  mode: 'astronomy';
  value: string; // unused placeholder; kept for storage shape uniformity
  showApodTitle?: boolean; // default false — overlay NASA's title for the day
}

export interface ColorGradientConfig extends BackgroundShared {
  mode: 'colourGradient';
  value: string;             // unused; kept for storage shape uniformity with other modes
  gradientType?: 'linear' | 'radial'; // default 'linear'
  angle?: number;             // 0-360, default 135 — linear only
  from?: string;               // hex, default '#ffffff'
  to?: string;                 // hex, default '#000000'
}

export interface OnlineImageConfig extends BackgroundShared {
  mode: 'online';
  value: string; // user-supplied image URL
}

export interface WikimediaConfig extends BackgroundShared {
  mode: 'wikimedia';
  value: string; // unused placeholder; kept for storage shape uniformity
  showTitle?: boolean; // default false — overlay Wikimedia's Picture of the Day title/artist
}

export type BackgroundConfig =
  | PresetConfig
  | ColorConfig
  | CustomImageConfig
  | UnsplashConfig
  | BingConfig
  | AstronomyConfig
  | ColorGradientConfig
  | OnlineImageConfig
  | WikimediaConfig;

export type BackgroundMode = BackgroundConfig['mode'];

// ─── Defaults ──────────────────────────────────────────────────────────────
// First-run and post-factory-reset default (BackgroundContext falls back to
// this when storage is empty), and what "Reset Appearance" restores.
export const DEFAULT_BG: ColorGradientConfig = {
  mode: 'colourGradient',
  value: '',
  gradientType: 'linear',
  angle: 135,
  from: '#ffffff',
  to: '#000000',
};

// ─── Editor grouping ───────────────────────────────────────────────────────
// Which settings-panel sub-view a provider's controls render under. Several
// modes can share one panel (preset/color/gradient all live under "colors").
export type BackgroundPanel = 'colors' | 'image' | 'unsplash' | 'bing' | 'astronomy' | 'gradient' | 'online' | 'wikimedia';

// ─── Provider registry interface ───────────────────────────────────────────
export interface BackgroundProviderDef<C extends BackgroundConfig = BackgroundConfig> {
  mode: C['mode'];
  label: string;
  /** Editor sub-panel this provider's mode is edited under (drives the Background dropdown). */
  panel: BackgroundPanel;
  /** Resolves the CSS `background` value from config + runtime data */
  resolveCss: (config: C, ctx: BackgroundRenderCtx) => string;
}

export interface BackgroundRenderCtx {
  isDark: boolean;
  customImageUrl: string | null;
  /** Current cached Unsplash image URL (populated by UnsplashProvider) */
  unsplashImageUrl?: string | null;
  /** Current cached Bing Daily Wallpaper image URL */
  bingImageUrl?: string | null;
  /** Current cached NASA Astronomy Picture of the Day image URL */
  apodImageUrl?: string | null;
  /** Current cached Wikimedia Picture of the Day image URL */
  wikimediaImageUrl?: string | null;
}
