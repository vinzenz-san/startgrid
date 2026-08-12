import type { Widget, WidgetType } from '../types/widget';
import type { TranslationKey } from '../i18n';
import { buildNewWidget } from './gridUtils';
import { WIDGET_REGISTRY } from '../components/widgets/registry';

export interface PresetLayoutItem {
  type: WidgetType;
  col: number;
  row: number;
  w: number;
  h: number;
  /** Merged onto the widget type's own registry defaultData — for presets
   *  that need a widget pre-filled (a feed URL, a saved location, a
   *  quicklink) rather than left at its generic empty default. */
  data?: Record<string, unknown>;
}

export interface GridPreset {
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  /** Fully explicit widget positions/sizes/data — used instead of
   *  types/stacked/sizeOverrides when present, for layouts too irregular
   *  (multiple columns of differing heights) for the simpler single-column
   *  stacking mode below to express. */
  layout?: PresetLayoutItem[];
  types?: WidgetType[];
  /** Stack widgets directly on top of each other (same column, sequential
   *  rows) instead of auto-placing each one at the first free slot — the
   *  latter packs a narrow second widget beside the first instead of below
   *  it. Used for Focus's clock-above-search-bar layout. */
  stacked?: boolean;
  /** Per-preset widget size overrides — takes precedence over that widget
   *  type's own registry defaultSize (WIDGET_REGISTRY) for this preset only,
   *  without touching the shared default other presets/Add Widget still use. */
  sizeOverrides?: Partial<Record<WidgetType, { w: number; h: number }>>;
  /** Thumbnail shown in the layout-picker card grid (LayoutPresetPicker).
   *  Falls back to a text-only card when absent. */
  previewImage?: string;
}

// Onboarding-style "starting point" presets (Focus / Grid / Goals) — built
// around StartGrid's own widget set: Bookmark Search stands in for a
// dedicated search-bar widget (its own search-engine fallback makes it work
// even with zero bookmarks), and "Goals" is built around the To-Do widget
// since there's no dedicated daily-goal/quote widget here.
export const GRID_PRESETS: GridPreset[] = [
  { id: 'focus', labelKey: 'widgets.presets.focus', descriptionKey: 'widgets.presets.focusDescription', types: ['clock', 'bookmarkSearch'], stacked: true, sizeOverrides: { clock: { w: 15, h: 2 }, bookmarkSearch: { w: 11, h: 1 } }, previewImage: '/presets/focus.webp' },
  {
    id: 'grid', labelKey: 'widgets.presets.grid', descriptionKey: 'widgets.presets.gridDescription', previewImage: '/presets/grid.webp',
    layout: [
      { type: 'clock', col: 1, row: 1, w: 15, h: 2 },
      { type: 'greeting', col: 1, row: 3, w: 15, h: 1 },
      { type: 'bookmarkSearch', col: 1, row: 4, w: 15, h: 1 },
      { type: 'rssFeed', col: 1, row: 5, w: 5, h: 5, data: { feedUrl: 'http://www.theverge.com/rss/full.xml' } },
      {
        type: 'quicklinks', col: 6, row: 5, w: 5, h: 5,
        data: {
          links: [{ id: 'ql-startgrid', url: 'https://vinzenz-dev.de/startgrid', title: 'Startgrid project page', showTitle: true, showWhiteBadge: true, iconSource: 'auto' }],
          layout: 'list',
          showTitles: true,
        },
      },
      { type: 'weather', col: 11, row: 5, w: 5, h: 3, data: { locationName: 'Berlin, Germany', latitude: 52.52, longitude: 13.405 } },
      { type: 'notes', col: 11, row: 8, w: 5, h: 2 },
    ],
  },
  {
    id: 'goals', labelKey: 'widgets.presets.goals', descriptionKey: 'widgets.presets.goalsDescription', previewImage: '/presets/goals.webp',
    types: ['clock', 'greeting', 'bookmarkSearch', 'invisible-spacer', 'todoList'],
    stacked: true,
    sizeOverrides: {
      clock: { w: 15, h: 2 },
      greeting: { w: 15, h: 1 },
      bookmarkSearch: { w: 15, h: 1 },
      'invisible-spacer': { w: 15, h: 1 },
      todoList: { w: 5, h: 3 },
    },
  },
];

/**
 * Builds a complete, non-overlapping Widget[] for a preset — replaces
 * whatever's currently on the grid (the caller is responsible for
 * confirming that destructive step with the user before calling
 * replaceAllWidgets with the result).
 */
export function applyPreset(presetId: string, columns: number): Widget[] {
  const preset = GRID_PRESETS.find(p => p.id === presetId);
  if (!preset) return [];

  if (preset.layout) {
    return preset.layout.map((item, i) => {
      const { defaultData, defaultStyle } = WIDGET_REGISTRY[item.type];
      return {
        id: `w-preset-${Date.now()}-${i}`, type: item.type, col: item.col, row: item.row,
        w: item.w, h: item.h,
        data: item.data ? { ...defaultData as object, ...item.data } : defaultData,
        ...defaultStyle,
      } as Widget;
    });
  }

  const placed: Widget[] = [];
  let nextStackedRow = 1;
  (preset.types ?? []).forEach((type, i) => {
    if (preset.stacked) {
      const { defaultData, defaultStyle } = WIDGET_REGISTRY[type];
      const defaultSize = preset.sizeOverrides?.[type] ?? WIDGET_REGISTRY[type].defaultSize;
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
        ...defaultStyle,
      } as Widget);
      return;
    }
    // Built up sequentially against `placed` so each new widget avoids every
    // one placed before it, same as buildNewWidget's normal "add one widget"
    // use — just called in a loop here instead of once per user click
    // (buildNewWidget already merges the widget type's defaultStyle in).
    const widget = buildNewWidget(placed, columns, type);
    placed.push({ ...widget, id: `w-preset-${Date.now()}-${i}` } as Widget);
  });
  return placed;
}
