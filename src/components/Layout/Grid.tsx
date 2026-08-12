import { useState, useEffect } from 'react';
import { useEditMode } from '../../contexts/EditModeContext';
import { useWidgets } from '../../contexts/WidgetContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import RGLGrid from './RGLGrid';
import AddWidgetMenu from '../shared/AddWidgetMenu';
import ThemeToggle from '../shared/ThemeToggle';
import GearIcon from '../shared/icons/GearIcon';
import SettingsPanel from './SettingsPanel';
import WidgetTour from '../shared/WidgetTour';
import LayoutPresetPicker from '../shared/LayoutPresetPicker';
import CommandPalette from '../shared/CommandPalette';
import DevPanel, { type DevPanelPos } from '../DevPanel/DevPanel';
import InspectorHistoryPanel from '../DevPanel/InspectorHistoryPanel';
import EditHistoryPanel from '../shared/EditHistoryPanel';
import { ElementInspectorProvider } from '../../contexts/ElementInspectorContext';
import { isExtension } from '../../lib/storage';
import { APP_VERSION } from '../../lib/appVersion';
import './Grid.css';

export default function Grid() {
  const { isEditMode, toggleEditMode } = useEditMode();
  const { widgets, loaded } = useWidgets();
  const { gridConfig } = useGridConfig();
  const {
    developerOptionsEnabled, settingsPinned, elementInspectorEnabled,
    disableGridGlow, widgetTourSeen, widgetTourSeenVersion, t,
    editHistoryPanelEnabled,
    loaded: settingsLoaded,
  } = useSettings();
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [devPanelPos,       setDevPanelPos]       = useState<DevPanelPos | null>(null);
  const [tourOpen,          setTourOpen]          = useState(false);
  const [presetPickerOpen,  setPresetPickerOpen]  = useState(false);

  // Auto-trigger the widget onboarding tour once widgets have loaded (never
  // flashes open on a dashboard that's still mid-restore). Gating differs by
  // build target:
  //  - Real installed extension: `widgetTourSeen` alone, so it shows exactly
  //    once ever, regardless of later version updates.
  //  - docs/preview demo (same bundle, served as a plain web page — see
  //    sync-preview.js and the `isExtension` runtime check in storage.ts):
  //    gated on `widgetTourSeenVersion` instead, so a returning visitor sees
  //    it again after each release, demoing what's new to repeat visitors.
  //
  // Must also wait on settingsLoaded, not just widgets' own `loaded` — the
  // two live in separate storage.get() calls with no ordering guarantee.
  // Reading widgetTourSeen before its own hydration finishes sees it stuck
  // at SETTINGS_DEFAULTS (false), which re-opened the tour on tabs where
  // widgets happened to hydrate first, even though it had already been seen.
  useEffect(() => {
    if (!loaded || !settingsLoaded) return;
    const shouldShow = isExtension
      ? !widgetTourSeen
      : widgetTourSeenVersion !== APP_VERSION;
    if (shouldShow) openTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, settingsLoaded]);

  // Tour entry/exit should always find (and leave) the dashboard in its
  // plain resting state — settings closed, layout locked — regardless of
  // whatever the user had open right before triggering it (first run or a
  // manual replay), and regardless of what the tour itself toggled on
  // mid-flow (it opens Settings and enables edit mode partway through).
  const openTour = () => {
    setSettingsPanelOpen(false);
    if (isEditMode) toggleEditMode();
    setTourOpen(true);
  };
  const closeTour = () => {
    setSettingsPanelOpen(false);
    if (isEditMode) toggleEditMode();
    setTourOpen(false);
  };

  // Total rows the grid container (and its glow overlay, which inherits the
  // same --content-rows custom property — see Grid.css) needs to cover.
  // Outside of editing, this is strictly the bottom-most occupied widget row
  // — no buffer — so the container snaps snugly to content and never shows
  // an idle empty-scroll tail. While editing, +5 extra rows are added past
  // the real content so there's headroom to drag a widget into open space
  // below current content. RGLGrid.tsx runs with no auto-compaction
  // (noCompactor — widgets keep whatever custom position they're dropped
  // at), so unlike vertical-compaction mode, that headroom is load-bearing:
  // without it there'd be nowhere past the last row to drop a widget into.
  const widgetsBottomRow = Math.max(0, ...widgets.map(w => w.row + w.h - 1));
  const contentRows = isEditMode ? widgetsBottomRow + 5 : widgetsBottomRow;

  return (
    <ElementInspectorProvider enabled={developerOptionsEnabled && elementInspectorEnabled}>
    <div className={`sg-root${isEditMode ? ' sg-root--edit' : ''}`}>

      {/* ── Bottom control bar ──────────────────────────────────────────
          Two shapes depending on edit mode, not a single always-identical
          cluster:
          - Idle: two small icon-only buttons grouped at the bottom-right — a
            settings gear and a pencil that enters edit mode.
          - Editing: those two collapse into one full-width bar spanning the
            bottom edge, adding Add Widget and the theme toggle alongside
            Settings and a "Finish Editing" button. */}
      {isEditMode ? (
        <div className="sg-bottom-bar">
          <AddWidgetMenu className="sg-controls-add-widget" />

          <button
            className={`sg-bottom-bar-btn${settingsPanelOpen ? ' active' : ''}`}
            onPointerDown={e => { e.stopPropagation(); e.preventDefault(); if (!settingsPinned) setSettingsPanelOpen(s => !s); }}
            title={t('dashboard.settings')}
          >
            <GearIcon size={14} />
            <span>{t('dashboard.settings')}</span>
          </button>

          <ThemeToggle />

          <button
            className="sg-bottom-bar-btn active"
            onPointerDown={() => { setSettingsPanelOpen(false); toggleEditMode(); }}
            title={t('dashboard.finishEditing')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{t('dashboard.finishEditing')}</span>
          </button>
        </div>
      ) : (
        <div className="sg-idle-icons">
          <button
            className="sg-idle-icon"
            onPointerDown={e => { e.stopPropagation(); e.preventDefault(); if (!settingsPinned) setSettingsPanelOpen(s => !s); }}
            title={t('dashboard.settings')}
          >
            <GearIcon size={15} />
          </button>
          <button
            className="sg-idle-icon"
            onPointerDown={() => { setSettingsPanelOpen(false); toggleEditMode(); }}
            title={t('dashboard.editLayout')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
        </div>
      )}

      <SettingsPanel
        onClose={() => setSettingsPanelOpen(false)}
        isOpen={settingsPanelOpen || settingsPinned}
        onReplayTour={openTour}
      />

      <WidgetTour
        open={tourOpen}
        onClose={closeTour}
        onOpenSettings={() => setSettingsPanelOpen(true)}
        onComplete={() => setPresetPickerOpen(true)}
      />

      <LayoutPresetPicker
        open={presetPickerOpen}
        onClose={() => setPresetPickerOpen(false)}
      />

      <CommandPalette />

      <div className="sg-edit-scrim" />

      <main
        className={`sg-grid-wrapper${settingsPinned ? ' sg-grid-wrapper--pinned-right' : ''}${gridConfig.verticalCenter ? ' sg-grid-wrapper--center-vertical' : ''}`}
        onClick={() => { if (!settingsPinned) setSettingsPanelOpen(false); }}
      >
        <RGLGrid contentRows={contentRows} disableGridGlow={disableGridGlow} />
      </main>

      {developerOptionsEnabled && <DevPanel position={devPanelPos} onPositionChange={setDevPanelPos} />}
      {developerOptionsEnabled && elementInspectorEnabled && devPanelPos && (
        <InspectorHistoryPanel devPanelPos={devPanelPos} />
      )}
      {isEditMode && editHistoryPanelEnabled && (
        <EditHistoryPanel devPanelPos={developerOptionsEnabled ? devPanelPos : null} />
      )}
    </div>
    </ElementInspectorProvider>
  );
}
