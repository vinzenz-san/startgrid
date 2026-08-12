import type { ReactNode } from 'react';
import type { WidgetDataMap, WidgetType, WidgetBase, ClockData, QuicklinksData, BookmarksData, BookmarkSearchData, CalendarData, OutlookCalendarData, OutlookMailData, NotesData, ObsidianCaptureData, ObsidianDailyData, ObsidianNoteData, ObsidianSearchData, ObsidianRandomData, GreetingData, WeatherData, RssFeedData, TodoData, CurrencyTickerData, RainRadarData, PlaceholderData, SpacerData } from '../../types/widget';
import type { TranslationKey } from '../../i18n';
import Clock, { ClockSettings } from './Clock/Clock';
import Quicklinks, { QuicklinksSettings } from './Quicklinks/Quicklinks';
import BookmarkFolder, { BookmarkFolderSettings } from './BookmarkFolder/BookmarkFolder';
import BookmarkSearch, { BookmarkSearchSettings } from './BookmarkSearch/BookmarkSearch';
import Calendar, { CalendarSettings } from './Calendar/Calendar';
import OutlookCalendar, { OutlookCalendarSettings } from './OutlookCalendar/OutlookCalendar';
import OutlookMail, { OutlookMailSettings } from './OutlookMail/OutlookMail';
import Notes, { NotesSettings } from './Notes/Notes';
import ObsidianCapture, { ObsidianCaptureSettings } from './ObsidianCapture/ObsidianCapture';
import ObsidianDaily, { ObsidianDailySettings } from './ObsidianDaily/ObsidianDaily';
import ObsidianNote, { ObsidianNoteSettings } from './ObsidianNote/ObsidianNote';
import ObsidianSearch, { ObsidianSearchSettings } from './ObsidianSearch/ObsidianSearch';
import ObsidianRandom, { ObsidianRandomSettings } from './ObsidianRandom/ObsidianRandom';
import Greeting, { GreetingSettings } from './Greeting/Greeting';
import Weather, { WeatherSettings } from './Weather/Weather';
import RssFeed, { RssFeedSettings } from './RssFeed/RssFeed';
import TodoList, { TodoListSettings } from './TodoList/TodoList';
import CurrencyTicker, { CurrencyTickerSettings } from './CurrencyTicker/CurrencyTicker';
import RainRadar, { RainRadarSettings } from './RainRadar/RainRadar';
import WidgetPlaceholder from '../shared/WidgetPlaceholder';
import SpacerWidget from './SpacerWidget/SpacerWidget';

// ── Types ──────────────────────────────────────────────────────────────────────

// Fully typed per-widget entry — enforced at definition via `satisfies`.
interface TypedEntry<T> {
  label:       string;
  icon:        string;
  defaultSize: { w: number; h: number };
  defaultData: T;
  /** Local-style override (transparency/shadow/glass/gradient/etc.) applied
   *  to every newly created instance of this widget type — via the Add
   *  Widget menu, Ctrl+K palette, or a layout preset (buildNewWidget in
   *  gridUtils.ts and applyPreset in gridPresets.ts both merge this in).
   *  Existing widgets already on a grid are unaffected by changing this. */
  defaultStyle?: Partial<WidgetBase>;
  devOnly?:    boolean;
  titleBehavior:        'optional' | 'auto' | 'none';
  defaultTitle?:        string;
  defaultShowCustomTitle?: boolean;
  resolveDynamicTitle?: (data: T) => string | undefined;
  renderComponent: (data: T, onUpdateData: (patch: Partial<T>) => void, isSettingsOpen?: boolean, widgetId?: string) => ReactNode;
  renderSettings:  ((data: T, onUpdateData: (patch: Partial<T>) => void, widgetId?: string) => ReactNode) | null;
}

// Type-erased entry used for dynamic lookup by widget.type at runtime.
// The `satisfies` checks on each entry below guarantee the internal correctness.
export interface WidgetEntry {
  label:       string;
  icon:        string;
  defaultSize: { w: number; h: number };
  defaultData: unknown;
  defaultStyle?: Partial<WidgetBase>;
  devOnly?:    boolean;
  titleBehavior:        'optional' | 'auto' | 'none';
  defaultTitle?:        string;
  defaultShowCustomTitle?: boolean;
  resolveDynamicTitle?: (data: unknown) => string | undefined;
  renderComponent: (data: unknown, onUpdateData: (patch: unknown) => void, isSettingsOpen?: boolean, widgetId?: string) => ReactNode;
  renderSettings:  ((data: unknown, onUpdateData: (patch: unknown) => void, widgetId?: string) => ReactNode) | null;
}

// ── Registry ───────────────────────────────────────────────────────────────────

const _registry = {
  clock: {
    label:         'Clock',
    icon:          '🕐',
    defaultSize:   { w: 4, h: 2 },
    defaultData:   {
      format: '24h', showSeconds: false, showDate: false, allowOverflow: true,
      fontSettings: { fontWeight: 500 },
      displaySettings: { scale: 1.5, fontSize: 60 },
    } satisfies ClockData,
    // Transparency 100% / Shadow 0% / Glass 0% / Gradient Intensity 0% — was
    // previously only applied by the layout presets (gridPresets.ts); now the
    // default for every new Clock however it's added.
    defaultStyle: {
      localOverrideEnabled: true,
      bgOpacity: 0,
      bgShadow: 0,
      bgGlass: 0,
      bgGradientIntensity: 0,
    },
    titleBehavior: 'none',
    renderComponent: (data, onUpdateData) => <Clock data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <ClockSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ClockData>,

  quicklinks: {
    label:                 'Quicklinks',
    icon:                  '🔗',
    defaultSize:           { w: 2, h: 2 },
    defaultData:           { links: [], layout: 'grid' } satisfies QuicklinksData,
    titleBehavior:         'optional',
    defaultTitle:          'Quicklinks',
    defaultShowCustomTitle: false,
    renderComponent: (data, onUpdateData) => <Quicklinks data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <QuicklinksSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<QuicklinksData>,

  bookmarks: {
    label:                 'Bookmark Folder',
    icon:                  '🔖',
    defaultSize:           { w: 2, h: 3 },
    defaultData:           { sortingMode: 'original' } satisfies BookmarksData,
    titleBehavior:         'optional',
    defaultTitle:          'Bookmarks',
    defaultShowCustomTitle: false,
    resolveDynamicTitle:   (data) => data.folderTitle,
    renderComponent: (data, onUpdateData) => <BookmarkFolder data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <BookmarkFolderSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<BookmarksData>,

  bookmarkSearch: {
    label:         'Bookmark Search',
    icon:          '🔍',
    defaultSize:   { w: 4, h: 1 },
    defaultData:   { maxResults: 10, googleFallback: true } satisfies BookmarkSearchData,
    titleBehavior: 'none',
    renderComponent: (data, onUpdateData) => <BookmarkSearch data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <BookmarkSearchSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<BookmarkSearchData>,

  calendar: {
    label:         'Google Calendar',
    icon:          '📅',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   { maxDays: 3, showAllDay: true } satisfies CalendarData,
    // Google OAuth verification of the calendar.readonly scope succeeded
    // (2026-07-28) — no longer gated behind Developer Options.
    titleBehavior: 'auto',
    renderComponent: (data, onUpdateData) => <Calendar data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <CalendarSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<CalendarData>,

  outlookCalendar: {
    label:         'Outlook Calendar',
    icon:          '📆',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   { maxDays: 3, showAllDay: true } satisfies OutlookCalendarData,
    titleBehavior: 'auto',
    renderComponent: (data, onUpdateData) => <OutlookCalendar data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <OutlookCalendarSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<OutlookCalendarData>,

  outlookMail: {
    label:         'Outlook Mail',
    icon:          '📧',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   { maxResults: 8, showUnreadOnly: false } satisfies OutlookMailData,
    titleBehavior: 'auto',
    renderComponent: (data, onUpdateData) => <OutlookMail data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <OutlookMailSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<OutlookMailData>,

  notes: {
    label:                 'Notes',
    icon:                  '📝',
    defaultSize:           { w: 2, h: 2 },
    defaultData:           { content: '', fontSize: 13, storageMode: 'local' } satisfies NotesData,
    titleBehavior:         'optional',
    defaultTitle:          'Notes',
    defaultShowCustomTitle: false,
    renderComponent: (data, onUpdateData, isSettingsOpen, widgetId) => <Notes data={data} onUpdateData={onUpdateData} widgetId={widgetId} />,
    renderSettings:  (data, onUpdateData, widgetId) => <NotesSettings data={data} onUpdateData={onUpdateData} widgetId={widgetId} />,
  } satisfies TypedEntry<NotesData>,

  obsidianCapture: {
    label:                 'Obsidian Quick Capture',
    icon:                  '◈',
    defaultSize:           { w: 2, h: 2 },
    defaultData:           { targetMode: 'daily', bulletPrefix: true, clearAfterSend: true } satisfies ObsidianCaptureData,
    titleBehavior:         'optional',
    defaultTitle:          'Quick Capture',
    defaultShowCustomTitle: false,
    renderComponent: (data, _onUpdateData, _isSettingsOpen, widgetId) => <ObsidianCapture data={data} widgetId={widgetId} />,
    renderSettings:  (data, onUpdateData) => <ObsidianCaptureSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ObsidianCaptureData>,

  obsidianDaily: {
    label:         'Obsidian Daily Note',
    icon:          '◈',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   { showChecked: true } satisfies ObsidianDailyData,
    // The loopback host permission is documented in the privacy policy and
    // both store listings, so this is no longer gated behind Developer
    // Options — the same path Calendar took.
    titleBehavior: 'auto',
    renderComponent: (data) => <ObsidianDaily data={data} />,
    renderSettings:  (data, onUpdateData) => <ObsidianDailySettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ObsidianDailyData>,

  obsidianNote: {
    label:         'Obsidian Pinned Note',
    icon:          '◈',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   {} satisfies ObsidianNoteData,
    titleBehavior: 'auto',
    renderComponent: (data) => <ObsidianNote data={data} />,
    renderSettings:  (data, onUpdateData) => <ObsidianNoteSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ObsidianNoteData>,

  obsidianSearch: {
    label:         'Obsidian Vault Search',
    icon:          '◈',
    defaultSize:   { w: 2, h: 1 },
    defaultData:   { maxResults: 8, contextLength: 100 } satisfies ObsidianSearchData,
    titleBehavior: 'none',
    renderComponent: (data) => <ObsidianSearch data={data} />,
    renderSettings:  (data, onUpdateData) => <ObsidianSearchSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ObsidianSearchData>,

  obsidianRandom: {
    label:                 'Obsidian Random Note',
    icon:                  '◈',
    defaultSize:           { w: 2, h: 2 },
    defaultData:           { refreshOn: 'load', showExcerpt: false, excerptLines: 4 } satisfies ObsidianRandomData,
    titleBehavior:         'optional',
    defaultTitle:          'Random Note',
    defaultShowCustomTitle: false,
    renderComponent: (data) => <ObsidianRandom data={data} />,
    renderSettings:  (data, onUpdateData) => <ObsidianRandomSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<ObsidianRandomData>,

  greeting: {
    label:         'Greeting',
    icon:          '👋',
    defaultSize:   { w: 2, h: 1 },
    defaultData:   { alignment: 'left' } satisfies GreetingData,
    titleBehavior: 'none',
    renderComponent: (data, onUpdateData) => <Greeting data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <GreetingSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<GreetingData>,

  weather: {
    label:         'Weather',
    icon:          '⛅',
    defaultSize:   { w: 2, h: 2 },
    defaultData:   { units: 'metric', showFeelsLike: true, showLocationName: true } satisfies WeatherData,
    titleBehavior: 'none',
    renderComponent: (data, onUpdateData) => <Weather data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <WeatherSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<WeatherData>,

  rssFeed: {
    label:         'RSS Feed',
    icon:          '📰',
    defaultSize:   { w: 2, h: 3 },
    defaultData:   { maxItems: 8, showDescription: false, refreshIntervalMin: 30 } satisfies RssFeedData,
    titleBehavior: 'auto',
    resolveDynamicTitle: (data) => data.feedTitle,
    renderComponent: (data, onUpdateData) => <RssFeed data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <RssFeedSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<RssFeedData>,

  todoList: {
    label:                 'To-Do',
    icon:                  '✅',
    defaultSize:           { w: 2, h: 2 },
    defaultData:           { items: [], hideCompleted: false } satisfies TodoData,
    titleBehavior:         'optional',
    defaultTitle:          'To-Do',
    defaultShowCustomTitle: false,
    renderComponent: (data, onUpdateData) => <TodoList data={data} onUpdateData={onUpdateData} />,
    renderSettings:  (data, onUpdateData) => <TodoListSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<TodoData>,

  currencyTicker: {
    label:         'Currency',
    icon:          '💱',
    defaultSize:   { w: 2, h: 2 },
    defaultData:   { baseCurrency: 'EUR', targetCurrencies: ['USD', 'GBP'], refreshIntervalMin: 60 } satisfies CurrencyTickerData,
    titleBehavior: 'none',
    renderComponent: (data) => <CurrencyTicker data={data} />,
    renderSettings:  (data, onUpdateData) => <CurrencyTickerSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<CurrencyTickerData>,

  rainRadar: {
    label:         'Rain Radar',
    icon:          '🌧️',
    defaultSize:   { w: 2, h: 2 },
    defaultData:   { zoom: 6, opacity: 70 } satisfies RainRadarData,
    titleBehavior: 'none',
    renderComponent: (data) => <RainRadar data={data} />,
    renderSettings:  (data, onUpdateData) => <RainRadarSettings data={data} onUpdateData={onUpdateData} />,
  } satisfies TypedEntry<RainRadarData>,

  placeholder: {
    label:         'Placeholder',
    icon:          '⬜',
    defaultSize:   { w: 2, h: 2 },
    defaultData:   { title: 'Placeholder' } satisfies PlaceholderData,
    devOnly:       true,
    titleBehavior: 'none',
    renderComponent: (data, _onUpdateData) => <WidgetPlaceholder widget={{ type: 'placeholder', data, id: '', col: 1, row: 1, w: 1, h: 1 }} />,
    renderSettings:  null,
  } satisfies TypedEntry<PlaceholderData>,

  'invisible-spacer': {
    label:         'Invisible Spacer',
    icon:          '▫️',
    defaultSize:   { w: 1, h: 1 },
    defaultData:   {} satisfies SpacerData,
    titleBehavior: 'none',
    renderComponent: () => <SpacerWidget />,
    renderSettings:  null,
  } satisfies TypedEntry<SpacerData>,


} satisfies { [K in WidgetType]: TypedEntry<WidgetDataMap[K]> };

// One cast total — lets WidgetContainer index by dynamic widget.type.
export const WIDGET_REGISTRY = _registry as Record<WidgetType, WidgetEntry>;

// `entry.label` above stays a plain English literal — it's read as a live
// fallback for a widget's resolved title (WidgetContainer.tsx) and as the
// Add-Widget menu's internal key, not stored per-widget data. This map lets
// render sites look up the translated display text via t() without touching
// the registry's own (English, internal) label field.
export const WIDGET_TYPE_LABEL_KEYS: Record<WidgetType, TranslationKey> = {
  clock:          'widgets.type.clock',
  quicklinks:     'widgets.type.quicklinks',
  bookmarks:      'widgets.type.bookmarks',
  bookmarkSearch: 'widgets.type.bookmarkSearch',
  calendar:       'widgets.type.calendar',
  outlookCalendar: 'widgets.type.outlookCalendar',
  outlookMail:    'widgets.type.outlookMail',
  notes:          'widgets.type.notes',
  obsidianCapture: 'widgets.type.obsidianCapture',
  obsidianDaily:  'widgets.type.obsidianDaily',
  obsidianNote:   'widgets.type.obsidianNote',
  obsidianSearch: 'widgets.type.obsidianSearch',
  obsidianRandom: 'widgets.type.obsidianRandom',
  greeting:       'widgets.type.greeting',
  weather:        'widgets.type.weather',
  rssFeed:        'widgets.type.rssFeed',
  todoList:       'widgets.type.todoList',
  currencyTicker: 'widgets.type.currencyTicker',
  rainRadar:      'widgets.type.rainRadar',
  placeholder:    'widgets.type.placeholder',
  'invisible-spacer': 'widgets.type.invisibleSpacer',
};

// Ordered list for the "Add Widget" menu (excludes placeholder handled separately if desired).
export const WIDGET_MENU_TYPES: WidgetType[] = [
  'clock', 'quicklinks', 'bookmarks', 'bookmarkSearch', 'calendar', 'outlookCalendar', 'outlookMail', 'notes', 'obsidianCapture', 'obsidianDaily', 'obsidianNote', 'obsidianSearch', 'obsidianRandom', 'greeting', 'weather', 'rssFeed', 'todoList', 'currencyTicker', 'rainRadar', 'invisible-spacer', 'placeholder',
];
