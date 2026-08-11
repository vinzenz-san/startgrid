import type { Widget, WidgetType } from '../types/widget';
import type { TranslationKey } from '../i18n';
import { buildNewWidget } from './gridUtils';
import { WIDGET_REGISTRY } from '../components/widgets/registry';

export interface GridPreset {
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  types: WidgetType[];
  /** Stack widgets directly on top of each other (same column, sequential
   *  rows) instead of auto-placing each one at the first free slot — the
   *  latter packs a narrow second widget beside the first instead of below
   *  it. Used for Focus's clock-above-search-bar layout. */
  stacked?: boolean;
}

// Onboarding-style "starting point" presets (Focus / Grid / Goals) — built
// around StartGrid's own widget set: Bookmark Search stands in for a
// dedicated search-bar widget (its own search-engine fallback makes it work
// even with zero bookmarks), and "Goals" is built around the To-Do widget
// since there's no dedicated daily-goal/quote widget here.
export const GRID_PRESETS: GridPreset[] = [
  { id: 'focus', labelKey: 'widgets.presets.focus', descriptionKey: 'widgets.presets.focusDescription', types: ['clock', 'bookmarkSearch'], stacked: true },
  { id: 'grid', labelKey: 'widgets.presets.grid', descriptionKey: 'widgets.presets.gridDescription', types: ['clock', 'greeting', 'weather', 'calendar', 'quicklinks', 'bookmarks', 'notes', 'todoList', 'rssFeed'] },
  { id: 'goals', labelKey: 'widgets.presets.goals', descriptionKey: 'widgets.presets.goalsDescription', types: ['clock', 'greeting', 'todoList'] },
];

// Per-preset Clock style override — applied only to the Clock widget these
// presets create, on top of Clock's own registry defaults (WIDGET_REGISTRY),
// never mutating those defaults themselves. Values mirror WidgetContainer's
// local-style slider semantics: bgOpacity is inverted (1 - transparency%/100),
// bgShadow/bgGlass/bgGradientIntensity are plain 0-100 percentages.
const PRESET_CLOCK_STYLE: Partial<Widget> = {
  localOverrideEnabled: true,
  bgOpacity: 0,            // Transparency 100%
  bgShadow: 0,             // Shadow Intensity 0%
  bgGlass: 0,              // Glass effect 0%
  bgGradientIntensity: 0,  // Gradient Intensity 0%
};

/**
 * Builds a complete, non-overlapping Widget[] for a preset — replaces
 * whatever's currently on the grid (the caller is responsible for
 * confirming that destructive step with the user before calling
 * replaceAllWidgets with the result).
 */
export function applyPreset(presetId: string, columns: number): Widget[] {
  const preset = GRID_PRESETS.find(p => p.id === presetId);
  if (!preset) return [];

  const placed: Widget[] = [];
  let nextStackedRow = 1;
  preset.types.forEach((type, i) => {
    const styleOverride = type === 'clock' ? PRESET_CLOCK_STYLE : {};
    if (preset.stacked) {
      const { defaultSize, defaultData } = WIDGET_REGISTRY[type];
      const row = nextStackedRow;
      nextStackedRow += defaultSize.h;
      // Each stacked widget centers itself independently on the column axis
      // (rather than sharing one fixed column) — for a stack where every
      // widget is the same width, as Focus's clock+search is, that lines
      // them up on a shared center the same as a single centered column would.
      const col = Math.max(1, Math.floor((columns - defaultSize.w) / 2) + 1);
      placed.push({
        id: `w-preset-${Date.now()}-${i}`, type, col, row,
        w: defaultSize.w, h: defaultSize.h, data: defaultData,
        ...styleOverride,
      } as Widget);
      return;
    }
    // Built up sequentially against `placed` so each new widget avoids every
    // one placed before it, same as buildNewWidget's normal "add one widget"
    // use — just called in a loop here instead of once per user click.
    const widget = buildNewWidget(placed, columns, type);
    placed.push({ ...widget, id: `w-preset-${Date.now()}-${i}`, ...styleOverride } as Widget);
  });
  return placed;
}
