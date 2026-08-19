import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useStorage } from '../hooks/useStorage';
import { lightenHex } from '../lib/colorUtils';
import { mergeDefaults } from '../lib/mergeDefaults';
import { DICTIONARIES, interpolate, type TranslationKey } from '../i18n';

const STORAGE_KEY = 'sg:settings';

export type Language             = 'en' | 'de';
export type ColorScheme          = 'light' | 'dark' | 'system';

export interface AppSettings {
  language:                Language;
  colorScheme:             ColorScheme;
  accentColor:             string;
  developerOptionsEnabled: boolean;
  enableCustomContextMenu: boolean;
  settingsPinned:          boolean;
  elementInspectorEnabled: boolean;
  /** Default false (effect ON). When true, the hover-preview grid glow
   *  overlay (Grid settings section hover / edit mode) never shows. */
  disableGridGlow:         boolean;
  /** Default false (effect ON). When true, neither the Widgets-section
   *  hover-glow nor a per-widget settings-open glow is ever applied. */
  disableWidgetGlow:       boolean;
  /** Default false (effect ON). When true, hovering the Background section
   *  never blurs the widget grid. */
  disableBackgroundBlur:   boolean;
  /** Default false. Set true once the first-run widget onboarding tour has
   *  been shown (finished or skipped), so it never auto-triggers again.
   *  Toggling it back to false (via "Show tutorial again" in Settings)
   *  re-arms the auto-trigger on next load. Real installed extensions gate
   *  the auto-trigger on this flag alone (once ever, regardless of updates).
   *  The docs/preview demo instead gates on `widgetTourSeenVersion` below,
   *  so returning visitors see it again after each release — see the
   *  `isExtension` branch in Grid.tsx's auto-trigger effect. */
  widgetTourSeen:          boolean;
  /** APP_VERSION at the time the tour was last finished/skipped. Only
   *  consulted on the non-extension (docs/preview) build. */
  widgetTourSeenVersion:   string;
  /** Default true. Shows the floating Edit History panel during edit mode
   *  (last 5 undoable layout/grid changes, with a Ctrl+Z hint). The panel's
   *  own close button just flips this same setting off — it's one switch
   *  reachable from two places, not two separate dismiss mechanisms. */
  editHistoryPanelEnabled: boolean;
}

export const SETTINGS_DEFAULTS = {
  language:                'en',
  colorScheme:             'system',
  accentColor:             '#6366f1',
  developerOptionsEnabled: false,
  enableCustomContextMenu: false,
  settingsPinned:          false,
  elementInspectorEnabled: false,
  disableGridGlow:         false,
  disableWidgetGlow:       false,
  disableBackgroundBlur:   false,
  widgetTourSeen:          false,
  widgetTourSeenVersion:   '',
  editHistoryPanelEnabled: true,
} as const satisfies AppSettings;


interface SettingsCtx extends AppSettings {
  updateSettings: (patch: Partial<AppSettings>) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** True once the initial `storage.get` for settings has resolved. Before
   *  that, every field above is still sitting at SETTINGS_DEFAULTS, so
   *  anything gating on a persisted flag (e.g. widgetTourSeen) must wait
   *  for this instead of assuming the default value is the real one. */
  loaded: boolean;
}

const Ctx = createContext<SettingsCtx | null>(null);

/**
 * Owns app-wide settings (language, color scheme, accent color, developer
 * options, etc.), persisted via `useStorage`. Also injects `--accent`/
 * `--accent-hover` CSS variables and `data-scheme` onto `<html>`, and
 * exposes the `t()` i18n translator derived from the current language.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings, loaded] = useStorage<AppSettings>(STORAGE_KEY, SETTINGS_DEFAULTS);

  // Defensive: guard against undefined/null/partial from storage on first load or reset
  const s: AppSettings = mergeDefaults<AppSettings>(settings, SETTINGS_DEFAULTS);

  // Inject --accent / --accent-hover CSS variables globally
  useEffect(() => {
    document.documentElement.style.setProperty('--accent',       s.accentColor);
    document.documentElement.style.setProperty('--accent-hover', lightenHex(s.accentColor, 0.2));
  }, [s.accentColor]);

  // Inject color scheme onto <html data-scheme="...">
  useEffect(() => {
    document.documentElement.dataset.scheme = s.colorScheme;
  }, [s.colorScheme]);

  const updateSettings = (patch: Partial<AppSettings>) =>
    setSettings(prev => ({ ...(prev ?? SETTINGS_DEFAULTS), ...patch }));

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    interpolate(DICTIONARIES[s.language][key], vars);

  return (
    <Ctx.Provider value={{ ...s, updateSettings, t, loaded }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
