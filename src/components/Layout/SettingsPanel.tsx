import { useRef, useState, useEffect } from 'react';
import { ElementInspector } from './ElementInspector';
import BackgroundEditor from '../Background/BackgroundEditor';
import SwatchPicker from '../shared/SwatchPicker';
import { COLOR_PRESETS } from '../../lib/presets';
import { performFactoryReset, exportBackup, importBackup } from './BackupRestore';
import CustomColorPicker from '../shared/CustomColorPicker';
import ConfirmDialog from '../shared/ConfirmDialog';
import { SettingsRow, SettingsSwitch, SettingsSlider, ActionButton, IconButton, Dropdown } from '../shared/Form';
import { PanelSection, PanelSectionList } from './PanelSection';
import { DetailedSettings } from './DetailedSettings';
import { SettingsPanelOpenContext } from '../../contexts/SettingsPanelOpenContext';
import { useTheme, DEFAULTS as THEME_DEFAULTS } from '../../contexts/ThemeContext';
import { useSettings, SETTINGS_DEFAULTS } from '../../contexts/SettingsContext';
import { useBackground } from '../../contexts/BackgroundContext';
import WeatherEffectSettings from '../WeatherEffect/WeatherEffectSettings';
import { useEditMode } from '../../contexts/EditModeContext';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useApplyGridConfig } from '../../hooks/useApplyGridConfig';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { compactWidgets } from '../../lib/gridUtils';
import { DEFAULT_BG } from '../../types/background';
import AddWidgetMenu from '../shared/AddWidgetMenu';
import LayoutPresets from '../shared/LayoutPresets';
import type { Language } from '../../contexts/SettingsContext';
import { runThemeTransition } from '../../lib/themeTransition';
import { DEFAULT_GRID_CONFIG, type GridConfig } from '../../types/grid';
import { APP_VERSION } from '../../lib/appVersion';
import './SettingsPanel.css';

const APP_NAME = 'Startgrid';

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

interface Props {
  onClose: () => void;
  isOpen:  boolean;
  onReplayTour: () => void;
}

export default function SettingsPanel({ onClose, isOpen, onReplayTour }: Props) {
  const {
    globalColor, globalColorScheme, globalOpacity, globalDim, globalGradientIntensity, widgetShadowOpacity, globalGlassIntensity, globalPresetId,
    setGlobalColor, setGlobalOpacity, setGlobalDim, setGlobalGradientIntensity,
    setWidgetShadowOpacity, setGlobalGlassIntensity, setGlobalPresetId,
  } = useTheme();
  const {
    colorScheme, accentColor, language, developerOptionsEnabled,
    enableCustomContextMenu, settingsPinned, elementInspectorEnabled, updateSettings, t,
    disableGridGlow, disableWidgetGlow, disableBackgroundBlur, editHistoryPanelEnabled,
  } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  const { config, setConfig } = useBackground();
  const { isEditMode } = useEditMode();
  const { widgets, updateWidget, replaceAllWidgets } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { applyGridConfig } = useApplyGridConfig();
  const { pushHistory } = useEditHistory();
  const [devConfirmOpen,   setDevConfirmOpen]   = useState(false);
  // Developer Options stays hidden from the settings list until unlocked by
  // tapping the app title 7 times within 2s of each other (same pattern as
  // Android's hidden "build number" unlock) — deliberately undiscoverable
  // by a casual user, unlike the plainly-labeled toggle this used to be.
  const [devSectionRevealed, setDevSectionRevealed] = useState(false);
  const titleTapCountRef = useRef(0);
  const titleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTitleTap() {
    titleTapCountRef.current += 1;
    if (titleTapTimerRef.current) clearTimeout(titleTapTimerRef.current);
    titleTapTimerRef.current = setTimeout(() => { titleTapCountRef.current = 0; }, 2000);
    if (titleTapCountRef.current >= 7) {
      titleTapCountRef.current = 0;
      setDevSectionRevealed(true);
    }
  }
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pickerOpen,       setPickerOpen]       = useState(false);
  const accentSwatchRef = useRef<HTMLButtonElement>(null);

  // .sg-glow-all-widgets/.sg-blur-all-widgets (toggled below via raw
  // onMouseEnter/onMouseLeave on the Widgets/Background section wrappers)
  // can get stuck on: leaving edit mode via the Ctrl+E shortcut can close or
  // reflow this sidebar out from under the cursor without the browser ever
  // firing a mouseleave on it (the element moved, the pointer didn't), so
  // the hover-driven class removal never runs. Since neither effect makes
  // sense once editing stops, force both off whenever isEditMode goes false
  // as a backstop independent of whatever DOM element the hover started on.
  useEffect(() => {
    if (!isEditMode) {
      document.documentElement.classList.remove('sg-glow-all-widgets');
      document.documentElement.classList.remove('sg-blur-all-widgets');
    }
  }, [isEditMode]);

  // Same stuck-hover-class problem, different trigger: applying a layout
  // preset, resetting/compacting the grid, etc. all call replaceAllWidgets,
  // which changes this section's content height and can reflow the wrapper
  // out from under a stationary cursor (still mid-hover) with no mouseleave
  // firing to clean up after itself. Clearing on every `widgets` identity
  // change is a cheap, always-safe backstop — a real mouseenter simply
  // re-adds the class on the next actual hover.
  const widgetsRef = useRef(widgets);
  useEffect(() => {
    if (widgetsRef.current !== widgets) {
      widgetsRef.current = widgets;
      document.documentElement.classList.remove('sg-glow-all-widgets');
      document.documentElement.classList.remove('sg-blur-all-widgets');
    }
  }, [widgets]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [exporting,   setExporting]   = useState(false);

  async function handleExportClick() {
    setExporting(true);
    try { await exportBackup(); } finally { setExporting(false); }
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImporting(true);
    importBackup(file)
      .then(() => { setTimeout(() => window.location.reload(), 50); })
      .catch(err => {
        setImportError(err instanceof Error ? err.message : 'Unknown error.');
        setImporting(false);
      });
    e.target.value = '';
  }

  // Live "how many columns fit" hint for the Columns slider — recalculated
  // on resize, using this project's own cellWidth/gap instead of a fixed
  // cell size.
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const maxFitColumns = Math.max(1, Math.floor((windowWidth + gridConfig.gap) / (gridConfig.cellWidth + gridConfig.gap)));

  // Every grid control applies immediately (no separate Apply/confirm step) —
  // applyGridConfig already handles the rescale/repack orchestration, so this
  // is just a patch-and-commit helper over the current live config.
  const handleGridChange = (patch: Partial<GridConfig>) => {
    pushHistory('editHistory.changedGridSettings');
    applyGridConfig({ ...gridConfig, ...patch });
  };

  const handleResetGrid = () => {
    pushHistory('editHistory.resetGrid');
    applyGridConfig(DEFAULT_GRID_CONFIG);
  };

  const handleCompactGrid = () => {
    pushHistory('editHistory.compactedGrid');
    replaceAllWidgets(compactWidgets(widgets, gridConfig.columns));
  };

  const transparencyPct = 100 - Math.round(globalOpacity * 100);
  const isDark          = colorScheme !== 'light';
  // Was configurable via the (now-removed) Button Position setting; the
  // bottom control bar redesign hardcoded that setting away, so the sidebar
  // always slides in from the right now, its previous default.
  const panelSide       = 'right';

  function doResetAppearance() {
    setConfig(DEFAULT_BG);
    setGlobalColor(THEME_DEFAULTS.globalColor, THEME_DEFAULTS.globalColorScheme);
    setGlobalOpacity(THEME_DEFAULTS.globalOpacity);
    setGlobalDim(THEME_DEFAULTS.globalDim);
    setGlobalGradientIntensity(THEME_DEFAULTS.globalGradientIntensity);
    setWidgetShadowOpacity(THEME_DEFAULTS.widgetShadowOpacity);
    setGlobalGlassIntensity(THEME_DEFAULTS.globalGlassIntensity);
    setGlobalPresetId(THEME_DEFAULTS.globalPresetId);
    updateSettings({ colorScheme: SETTINGS_DEFAULTS.colorScheme, accentColor: SETTINGS_DEFAULTS.accentColor, enableCustomContextMenu: SETTINGS_DEFAULTS.enableCustomContextMenu });
  }

  function doRevertLocalStyles() {
    widgets.forEach(w => {
      if (w.localColorScheme !== undefined || w.localOverrideEnabled) {
        updateWidget(w.id, { localColorScheme: undefined, localOverrideEnabled: false });
      }
    });
  }

  function handleMatchBackground() {
    switch (config.mode) {
      case 'preset':
        if (COLOR_PRESETS.some(p => p.id === config.value)) setGlobalPresetId(config.value);
        break;
      case 'color':
      case 'gradient': {
        const hex = config.customColor ?? config.value.match(/#[0-9a-f]{6}/i)?.[0] ?? THEME_DEFAULTS.globalColor;
        setGlobalColor(hex, config.customColor ? (config.customColorScheme ?? 'dark') : 'dark');
        setGlobalPresetId(undefined);
        break;
      }
      case 'colourGradient':
        // A 2-color gradient has no single flat hex — button is disabled for this mode.
        break;
      default:
        // Every remaining image-backed provider (custom, online, bing, astronomy,
        // wikimedia, unsplash) shares the same letterboxColor fallback.
        setGlobalColor(config.letterboxColor ?? '#000000', 'dark');
        setGlobalPresetId(undefined);
        break;
    }
  }

  return (
    <div ref={panelRef} className={`sg-settings-panel sg-settings-panel--${panelSide}${isOpen ? ' sg-settings-panel--open' : ''}${isEditMode ? ' sg-settings-panel--with-bar' : ''}`} onClick={e => e.stopPropagation()}>
      <ElementInspector active={elementInspectorEnabled && developerOptionsEnabled} />

      {/* ── 1. HEADER ── */}
      <div className="sg-settings-header">
        <div className="sg-settings-header-left">
          <IconButton
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5" />
                <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
              </svg>
            }
            active={settingsPinned}
            onClick={() => updateSettings({ settingsPinned: !settingsPinned })}
            title={settingsPinned ? t('settings.unpinPanel') : t('settings.pinPanel')}
          />
          <div className="sg-settings-brand">
            <span className="sg-settings-brand-badge">
              <img src="icons/icon-48.png" width="14" height="14" alt="" aria-hidden="true" />
            </span>
            <span className="sg-settings-title" onClick={handleTitleTap}>{APP_NAME}</span>
            <span className="sg-settings-version">v{APP_VERSION}</span>
          </div>
        </div>
        {!settingsPinned && (
          <IconButton icon="✕" onClick={onClose} title={t('settings.close')} />
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div className="sg-settings-content sg-scroll-thin">
        {/* SettingsPanel never unmounts (only slides via CSS transform), so
            <DetailedSettings> reads this to reset itself back to closed on
            every reopen — see SettingsPanelOpenContext for why this doesn't
            remount (and re-hydrate from storage) the PanelSections below. */}
        <SettingsPanelOpenContext.Provider value={isOpen}>
        <PanelSectionList>

          {/* ══ 2. BACKGROUND ══ */}
          <div
            onMouseEnter={() => { if (!disableBackgroundBlur) document.documentElement.classList.add('sg-blur-all-widgets'); }}
            onMouseLeave={() => document.documentElement.classList.remove('sg-blur-all-widgets')}
          >
          <PanelSection title={t('background.sectionTitle')} collapsible persistenceKey="background" collapseGap="spacious">
            <BackgroundEditor />
          </PanelSection>
          </div>

          {/* ══ 3. WIDGETS ══ */}
          <div
            onMouseEnter={() => { if (!disableWidgetGlow) document.documentElement.classList.add('sg-glow-all-widgets'); }}
            onMouseLeave={() => document.documentElement.classList.remove('sg-glow-all-widgets')}
          >
          <PanelSection title={t('widgets.sectionTitle')} collapsible persistenceKey="widgets">
            {/* Add Widget */}
            <AddWidgetMenu />

            <SwatchPicker
              isDark={isDark}
              presetId={globalPresetId}
              customColor={globalColor}
              customColorScheme={globalColorScheme}
              onSelectPreset={id => setGlobalPresetId(id)}
              onSelectCustom={(hex, scheme) => { setGlobalColor(hex, scheme); setGlobalPresetId(undefined); }}
              variant="large"
            />
            <ActionButton variant="ghost" onClick={handleMatchBackground} disabled={config.mode === 'colourGradient'}>
              {t('widgets.matchBackground')}
            </ActionButton>
            <p className="bg-sync-warning">{t('widgets.globalStyleNote')}</p>
            <SettingsRow label={t('widgets.contextMenus')}>
              <SettingsSwitch
                checked={enableCustomContextMenu}
                onChange={v => updateSettings({ enableCustomContextMenu: v })}
              />
            </SettingsRow>
            <DetailedSettings>
              <SettingsSlider
                label={t('widgets.transparency')}
                value={transparencyPct}
                onChange={v => setGlobalOpacity((100 - v) / 100)}
              />
              <SettingsSlider
                label={t('widgets.shadowIntensity')}
                value={widgetShadowOpacity}
                onChange={setWidgetShadowOpacity}
              />
              <SettingsSlider
                label={t('widgets.glassIntensity')}
                value={globalGlassIntensity}
                onChange={setGlobalGlassIntensity}
              />
              <SettingsSlider
                label={t('widgets.gradientIntensity')}
                value={globalGradientIntensity}
                onChange={setGlobalGradientIntensity}
              />
              <SettingsSlider
                label={t('widgets.dimming')}
                value={Math.round(globalDim)}
                onChange={v => setGlobalDim(v)}
              />
            </DetailedSettings>

            <LayoutPresets />
          </PanelSection>
          </div>

          {/* ══ 4. GRID ══ */}
          <div
            onMouseEnter={() => { if (!disableGridGlow) document.documentElement.classList.add('sg-grid-glow-hover'); }}
            onMouseLeave={() => document.documentElement.classList.remove('sg-grid-glow-hover')}
          >
          <PanelSection title={t('grid.sectionTitle')} collapsible persistenceKey="grid">
            <SettingsSlider
              label={t('grid.columns')}
              value={gridConfig.columns}
              onChange={v => handleGridChange({ columns: v })}
              min={4}
              max={64}
              step={1}
              valueFormatter={v => String(v)}
            />
            <p className="bg-sync-warning">{t('grid.columnsFitHint', { count: maxFitColumns, width: windowWidth })}</p>
            {/* Single square-cell control — writes the same value to both
                cellWidth and cellHeight so the grid stays 1:1. The schema
                still carries them as independent fields (see grid.ts) for
                configs saved before this simplification; this slider just
                displays cellWidth as the representative value and, the
                moment it's touched, brings cellHeight into sync with it. */}
            <SettingsSlider
              label={t('grid.cellSize')}
              value={gridConfig.cellWidth}
              onChange={v => handleGridChange({ cellWidth: v, cellHeight: v })}
              min={10}
              max={200}
              step={5}
              valueFormatter={v => `${v}px`}
            />
            <SettingsSlider
              label={t('grid.gap')}
              value={gridConfig.gap}
              onChange={v => handleGridChange({ gap: v })}
              min={0}
              max={40}
              step={1}
              valueFormatter={v => `${v}px`}
            />
            <SettingsRow label={t('grid.verticalCenter')}>
              <SettingsSwitch
                checked={gridConfig.verticalCenter}
                onChange={v => handleGridChange({ verticalCenter: v })}
                label={t('grid.verticalCenter')}
              />
            </SettingsRow>
            <SettingsRow label={t('grid.fullPageGrid')}>
              <SettingsSwitch
                checked={gridConfig.fullPageGrid}
                onChange={v => handleGridChange({ fullPageGrid: v })}
                label={t('grid.fullPageGrid')}
              />
            </SettingsRow>
            <p className="sg-grid-experimental-warning">{t('grid.fullPageGridWarning')}</p>
            <p className="bg-sync-warning">{t('grid.note')}</p>
            <p className="sg-grid-experimental-warning">{t('grid.experimentalWarning')}</p>
            <ActionButton variant="danger" onClick={handleResetGrid}>
              {t('grid.reset')}
            </ActionButton>
            <p className="bg-sync-warning">{t('grid.compactGridHint')}</p>
            <ActionButton variant="ghost" onClick={handleCompactGrid}>
              {t('grid.compactGrid')}
            </ActionButton>
          </PanelSection>
          </div>

          {/* ══ 5. SETTINGS ══ */}
          <PanelSection title={t('settings.sectionTitle')} collapsible persistenceKey="settings">
            <SettingsRow label={t('settings.language')}>
              <Dropdown<Language>
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={v => updateSettings({ language: v })}
                className="sg-lang-dropdown"
              />
            </SettingsRow>
            <SettingsRow label={t('settings.globalTheme')}>
              <Dropdown
                options={[
                  { value: 'dark',  label: t('settings.globalTheme.dark') },
                  { value: 'light', label: t('settings.globalTheme.light') },
                ]}
                value={colorScheme === 'light' ? 'light' : 'dark'}
                onChange={v => runThemeTransition(() => updateSettings({ colorScheme: v }))}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.accentColor')}>
              <button
                ref={accentSwatchRef}
                className="bg-color-swatch"
                style={{ background: accentColor }}
                onClick={() => setPickerOpen(o => !o)}
                title="Pick accent color"
              />
            </SettingsRow>
            <SettingsRow label={t('settings.disableGridGlow')}>
              <SettingsSwitch
                checked={disableGridGlow}
                onChange={v => updateSettings({ disableGridGlow: v })}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.disableWidgetGlow')}>
              <SettingsSwitch
                checked={disableWidgetGlow}
                onChange={v => updateSettings({ disableWidgetGlow: v })}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.disableBackgroundBlur')}>
              <SettingsSwitch
                checked={disableBackgroundBlur}
                onChange={v => updateSettings({ disableBackgroundBlur: v })}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.editHistoryPanelEnabled')}>
              <SettingsSwitch
                checked={editHistoryPanelEnabled}
                onChange={v => updateSettings({ editHistoryPanelEnabled: v })}
              />
            </SettingsRow>

            <WeatherEffectSettings />

            <div className="sg-data-mgmt-row">
              <button className="sg-action-btn" onClick={onReplayTour}>
                {t('tour.replay')}
              </button>
            </div>

            <div className="sg-data-mgmt-row">
              <button className="sg-action-btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? t('settings.importing') : t('settings.import')}
              </button>
              <button className="sg-action-btn" onClick={handleExportClick} disabled={exporting}>
                {exporting ? t('settings.exporting') : t('settings.export')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFileChange}
              />
            </div>
            {importError && <p className="sg-backup-error">{importError}</p>}

            <ActionButton variant="danger" cooldownTime={1} onClick={doRevertLocalStyles}>
              {t('settings.resetWidgetStyles')}
            </ActionButton>
            <ActionButton variant="danger" cooldownTime={1} onClick={doResetAppearance}>
              {t('settings.resetAppearance')}
            </ActionButton>
            <ActionButton variant="danger" cooldownTime={3} onClick={() => setResetConfirmOpen(true)}>
              {t('settings.factoryReset')}
            </ActionButton>

            <a
              className="sg-support-link"
              href="https://buymeacoffee.com/vinzenz.san"
              target="_blank"
              rel="noopener noreferrer"
            >
              ☕ {t('settings.support')}
            </a>

            <a
              className="sg-support-link"
              href="https://github.com/vinzenz-san/startgrid/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              🐙 {t('settings.reportIssue')}
            </a>
          </PanelSection>

          {/* ══ 6. DEVELOPER OPTIONS (hidden until unlocked — see handleTitleTap) ══ */}
          {(devSectionRevealed || developerOptionsEnabled) && (
            <PanelSection title={t('dev.sectionTitle')} collapsible persistenceKey="developerOptions">
              <SettingsRow label={t('dev.enableDevMode')}>
                <SettingsSwitch
                  checked={developerOptionsEnabled}
                  onChange={v => { if (v) setDevConfirmOpen(true); else updateSettings({ developerOptionsEnabled: false }); }}
                />
              </SettingsRow>
            </PanelSection>
          )}

        </PanelSectionList>
        </SettingsPanelOpenContext.Provider>
      </div>

      {/* Idle state only (no edit-mode bar to already clear the panel's
          bottom) — a true non-scrolling sibling, same idea as the header
          above, not scroll-area padding. Content scrolls up and disappears
          behind this, rather than trailing off into empty reserved space at
          the end of the scroll — matches how the header already behaves. */}
      {!isEditMode && <div className="sg-settings-footer-spacer" />}

      {/* Portal-rendered accent color picker */}
      <CustomColorPicker
        value={accentColor}
        onChange={hex => updateSettings({ accentColor: hex })}
        anchorRef={accentSwatchRef}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onReset={() => updateSettings({ accentColor: SETTINGS_DEFAULTS.accentColor })}
        isDefault={accentColor === SETTINGS_DEFAULTS.accentColor}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={async () => { setResetConfirmOpen(false); await performFactoryReset(developerOptionsEnabled); }}
        title={t('settings.factoryReset.title')}
        body={t('settings.factoryReset.body')}
        confirmLabel={t('settings.factoryReset.confirm')}
      />

      <ConfirmDialog
        open={devConfirmOpen}
        onClose={() => setDevConfirmOpen(false)}
        onConfirm={() => { updateSettings({ developerOptionsEnabled: true }); setDevConfirmOpen(false); }}
        title={t('dev.confirm.title')}
        body={t('dev.confirm.body')}
        confirmLabel={t('dev.confirm.confirm')}
      />

    </div>
  );
}
