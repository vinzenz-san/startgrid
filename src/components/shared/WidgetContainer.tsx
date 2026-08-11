import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, flip, shift, offset, autoUpdate } from '@floating-ui/react';
import { useEditMode } from '../../contexts/EditModeContext';
import { useWidgets } from '../../contexts/WidgetContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { darkenHex, mixHex, getAdaptiveColor } from '../../lib/colorUtils';
import { COLOR_PRESETS } from '../../lib/presets';
import type { Widget } from '../../types/widget';
import { WIDGET_REGISTRY, WIDGET_TYPE_LABEL_KEYS } from '../widgets/registry';
import WidgetErrorBoundary, { CrashProbe } from './WidgetErrorBoundary';
import { SettingsSlider } from './Form';
import { SettingsRow, SettingsSwitch } from './Form';
import SwatchPicker from './SwatchPicker';
import ThemeToggle from './ThemeToggle';
import './WidgetContainer.css';

interface Props { widget: Widget; }

export default function WidgetContainer({ widget }: Props) {
  const { isEditMode } = useEditMode();
  const { removeWidget, updateWidget } = useWidgets();
  const { pushHistory } = useEditHistory();
  const { globalColor, globalColorScheme, globalOpacity, globalDim, globalGradientIntensity, globalPresetId, widgetShadowOpacity, globalGlassIntensity } = useTheme();
  const { colorScheme, enableCustomContextMenu, disableWidgetGlow, t } = useSettings();
  const elRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  // ── Floating panel positioning ────────────────────────────────────────────
  // Declared before the orphan-guard early return below (rather than in its
  // original spot further down, next to the title/header logic) — hooks must
  // run unconditionally on every render, and an unknown widget.type hitting
  // that early return would otherwise skip these, violating Rules of Hooks
  // the moment a stale/removed widget type shows up in storage.

  const { refs, floatingStyles } = useFloating({
    placement: 'right-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const setRef = (node: HTMLDivElement | null) => {
    (elRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    refs.setReference(node);
  };

  // Outside-click to close — ignore clicks inside any active color picker portal
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element;
      // Both are portaled to document.body, outside this panel's own DOM
      // subtree — without this exemption, a pointerdown on either one reads
      // as "outside click" and closes the whole panel before the picker's/
      // dropdown's own click handler (which fires after pointerdown) can run.
      if (target.closest('.ccp-panel') || target.closest('.sg-dropdown-menu') || target.closest('.sg-ql-links-panel')) return;
      if (!elRef.current?.contains(target) && !refs.floating.current?.contains(target))
        setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [settingsOpen, refs.floating]);

  // ── Registry lookup ───────────────────────────────────────────────────────

  const entry = WIDGET_REGISTRY[widget.type];

  // ── Orphan guard — unknown / removed widget type ──────────────────────────
  if (!entry) {
    return (
      <div className="sg-widget sg-widget--orphan">
        <div className="sg-widget-orphan-body">
          <span className="sg-widget-orphan-icon">⚠</span>
          <span className="sg-widget-orphan-title">Missing Widget</span>
          <span className="sg-widget-orphan-type">&ldquo;{widget.type}&rdquo; could not be loaded</span>
          <span className="sg-widget-orphan-desc">This safe fallback preserves your layout slot. Remove it or restore the widget type.</span>
          <button
            className="sg-widget-orphan-remove"
            onClick={() => removeWidget(widget.id)}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  const hasSettings = entry.renderSettings !== null;

  // ── Title / header ────────────────────────────────────────────────────────

  const showCustomTitle = widget.showCustomTitle ?? entry.defaultShowCustomTitle ?? false;
  const showHeader      = entry.titleBehavior === 'optional' && showCustomTitle;
  const titlePlaceholder = entry.resolveDynamicTitle?.(widget.data) ?? entry.defaultTitle ?? t(WIDGET_TYPE_LABEL_KEYS[widget.type]);
  const resolvedTitle    = widget.customTitle || titlePlaceholder;

  // ── Custom context menu ───────────────────────────────────────────────────

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableCustomContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    setSettingsOpen(true);
  };

  // ── Data update helper ────────────────────────────────────────────────────

  const handleUpdateData = (patch: unknown) => {
    // Every caller reaches this through a TypedEntry<T>'s onUpdateData, which
    // is `Partial<T>` for whichever T is being rendered — always an object,
    // and always a patch for widget.data's own (erased) type. This is the
    // one narrowing point at the type-erased registry boundary.
    const merged = { ...widget.data, ...(patch as Record<string, unknown>) } as Widget['data'];
    // updateWidget takes Partial<Widget>, a type discriminated on `type` —
    // omitting `type` here (we're only ever patching `data` for the widget
    // already known by id) means TS can't match this against one specific
    // union member. Same erasure boundary as above.
    updateWidget(widget.id, { data: merged } as Partial<Widget>);
  };

  const overrideEnabled      = widget.localOverrideEnabled ?? false;
  const localOpacityPct      = Math.round((widget.bgOpacity ?? globalOpacity) * 100);
  const localTransparencyPct = 100 - localOpacityPct;
  const localDimPct          = Math.round(widget.bgDim ?? globalDim);
  const localShadowPct       = Math.round(widget.bgShadow ?? widgetShadowOpacity);
  const localGlassPct        = Math.round(widget.bgGlass ?? globalGlassIntensity);

  // Effective intensity: per-widget value if set, else backwards-compat from old boolean, else global
  const localIntensity = widget.bgGradientIntensity
    ?? (widget.localGradientOverride === false ? 0 : globalGradientIntensity);

  // 'auto' (unset) follows the live global colorScheme; an explicit choice always wins.
  const widgetIsDark = widget.localColorScheme
    ? widget.localColorScheme !== 'light'
    : colorScheme !== 'light';

  const resolvePresetColor = (presetId: string) => {
    const preset = COLOR_PRESETS.find(p => p.id === presetId);
    if (!preset) return null;
    return !widgetIsDark && preset.lightOverride
      ? preset.lightOverride
      : getAdaptiveColor({ color: preset.master, pickedInDark: true }, widgetIsDark);
  };

  // Local preset > local custom color > global preset > global custom color —
  // one resolved hex regardless of which layer is active, so the blend below
  // (and the SwatchPicker preview) never needs to special-case presets vs colors.
  const effectiveColor =
    (widget.bgPresetId && resolvePresetColor(widget.bgPresetId)) ??
    (widget.bgColor !== undefined
      ? getAdaptiveColor({ color: widget.bgColor, pickedInDark: widget.bgColorScheme !== 'light' }, widgetIsDark)
      : null) ??
    (globalPresetId && resolvePresetColor(globalPresetId)) ??
    getAdaptiveColor({ color: globalColor, pickedInDark: globalColorScheme !== 'light' }, widgetIsDark);

  // Local override: set CSS variables on the element so ::before / ::after pick them up.
  const localOverrideStyle: React.CSSProperties = overrideEnabled
    ? (() => {
        const t = localIntensity / 100;
        const colorEnd = mixHex(effectiveColor, darkenHex(effectiveColor), t);
        const shadowPct = widget.bgShadow ?? widgetShadowOpacity;
        return {
          '--widget-bg-opacity':     String(widget.bgOpacity ?? globalOpacity),
          '--widget-dim':            String(widget.bgDim ?? globalDim),
          '--widget-shadow-opacity': String(shadowPct),
          '--widget-shadow-factor':  String((shadowPct / 100) ** 2),
          '--widget-glass':          String((widget.bgGlass ?? globalGlassIntensity) / 100),
          '--widget-bg-preset-css':  `linear-gradient(135deg, ${effectiveColor} 0%, ${colorEnd} 100%)`,
        } as React.CSSProperties;
      })()
    : {};

  // ── Floating panel (portalled) ────────────────────────────────────────────

  const floatingPanel = settingsOpen && createPortal(
    <div
      ref={refs.setFloating}
      className="sg-widget-float-panel sg-scroll-thin"
      style={floatingStyles}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="sg-widget-float-header">
        <span className="sg-widget-float-title">{t('widgets.floatTitle', { name: t(WIDGET_TYPE_LABEL_KEYS[widget.type]) })}</span>
        <button className="sg-widget-float-close" onClick={() => setSettingsOpen(false)} title={t('settings.close')}>✕</button>
      </div>

      {/* Title settings — only for 'optional' behavior */}
      {entry.titleBehavior === 'optional' && (
        <div className="sg-widget-title-section">
          <SettingsRow label={t('widgets.showTitle')}>
            <SettingsSwitch
              checked={showCustomTitle}
              onChange={v => updateWidget(widget.id, { showCustomTitle: v })}
            />
          </SettingsRow>
          <div className="sg-widget-title-input-wrap">
            <input
              className="sg-widget-title-input"
              type="text"
              disabled={!showCustomTitle}
              value={widget.customTitle ?? ''}
              placeholder={titlePlaceholder}
              onChange={e => updateWidget(widget.id, { customTitle: e.target.value || undefined })}
              onPointerDown={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Widget-specific settings — resolved from registry */}
      {entry.titleBehavior === 'optional' && entry.renderSettings && (
        <div className="sg-widget-float-divider" />
      )}
      <div className="sg-widget-settings-content">
        {entry.renderSettings?.(widget.data, handleUpdateData, widget.id)}
      </div>

      {/* Appearance section — shared across all widgets */}
      <div className="sg-widget-float-divider" />
      <div className="sg-widget-appearance">
        <div className="sg-widget-appearance-row">
          <span className="sg-widget-appearance-label">{t('widgets.localStyle')}</span>
          <button
            role="switch"
            aria-checked={overrideEnabled}
            className={`sg-form-switch${overrideEnabled ? ' sg-form-switch--on' : ''}`}
            onClick={() => updateWidget(widget.id, { localOverrideEnabled: !overrideEnabled })}
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="sg-form-switch-thumb" />
          </button>
        </div>

        {overrideEnabled && (
          <>
            <div className="sg-widget-appearance-section">
              <SettingsRow label={t('widgets.localTheme')}>
                <ThemeToggle
                  isDark={widgetIsDark}
                  onToggle={nextIsDark => updateWidget(widget.id, { localColorScheme: nextIsDark ? 'dark' : 'light' })}
                />
              </SettingsRow>
            </div>

            <div className="sg-widget-appearance-section">
              <span className="sg-widget-appearance-label">{t('widgets.presets')}</span>
              <SwatchPicker
                isDark={widgetIsDark}
                presetId={widget.bgPresetId}
                customColor={widget.bgColor}
                customColorScheme={widget.bgColorScheme}
                onSelectPreset={id => updateWidget(widget.id, { bgPresetId: id, bgColor: undefined, bgColorScheme: undefined })}
                onSelectCustom={(hex, scheme) => updateWidget(widget.id, { bgColor: hex, bgColorScheme: scheme, bgPresetId: undefined })}
              />
              <button
                className="sg-widget-match-global-btn"
                onClick={() => updateWidget(widget.id, {
                  bgColor: globalPresetId ? undefined : globalColor,
                  bgColorScheme: globalPresetId ? undefined : globalColorScheme,
                  bgPresetId: globalPresetId ?? undefined,
                })}
                onPointerDown={e => e.stopPropagation()}
              >
                {t('widgets.matchGlobalColor')}
              </button>
            </div>

            <div className="sg-widget-appearance-section">
              <SettingsSlider
                label={t('widgets.transparency')}
                value={localTransparencyPct}
                onChange={v => updateWidget(widget.id, { bgOpacity: (100 - v) / 100 })}
                onPointerDown={e => e.stopPropagation()}
              />
            </div>

            <div className="sg-widget-appearance-section">
              <SettingsSlider
                label={t('widgets.shadowIntensity')}
                value={localShadowPct}
                onChange={v => updateWidget(widget.id, { bgShadow: v })}
                onPointerDown={e => e.stopPropagation()}
              />
            </div>

            <div className="sg-widget-appearance-section">
              <SettingsSlider
                label={t('widgets.glassIntensity')}
                value={localGlassPct}
                onChange={v => updateWidget(widget.id, { bgGlass: v })}
                onPointerDown={e => e.stopPropagation()}
              />
            </div>

            <div className="sg-widget-appearance-section">
              <SettingsSlider
                label={t('widgets.gradientIntensity')}
                value={localIntensity}
                onChange={v => updateWidget(widget.id, { bgGradientIntensity: v })}
                onPointerDown={e => e.stopPropagation()}
              />
            </div>

            <div className="sg-widget-appearance-section">
              <SettingsSlider
                label={t('widgets.dimming')}
                value={localDimPct}
                onChange={v => updateWidget(widget.id, { bgDim: v })}
                onPointerDown={e => e.stopPropagation()}
              />
            </div>

            <div className="sg-widget-appearance-section">
              <button
                className="sg-widget-appearance-reset-all"
                onClick={() => updateWidget(widget.id, {
                  bgColor: undefined,
                  bgColorScheme: undefined,
                  bgPresetId: undefined,
                  bgOpacity: undefined,
                  bgDim: undefined,
                  bgShadow: undefined,
                  bgGlass: undefined,
                  bgGradientIntensity: undefined,
                  localColorScheme: undefined,
                })}
                onPointerDown={e => e.stopPropagation()}
              >
                {t('widgets.resetToGlobal')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <div
        ref={setRef}
        className={[
          'sg-widget',
          isEditMode   ? 'sg-widget--edit'            : '',
          settingsOpen ? 'sg-widget--settings-active' : '',
          settingsOpen && !disableWidgetGlow ? 'sg-widget--glow' : '',
          (widget.data as { allowOverflow?: boolean }).allowOverflow ? 'sg-widget--overflow' : '',
          widget.type === 'invisible-spacer' && !isEditMode ? 'sg-widget--spacer' : '',
        ].filter(Boolean).join(' ')}
        data-theme={overrideEnabled ? widget.localColorScheme : undefined}
        onContextMenu={handleContextMenu}
        style={localOverrideStyle}
      >
        {hasSettings && (
          <button
            className={`sg-widget-gear${settingsOpen ? ' active' : ''}`}
            draggable={false}
            onPointerDown={e => e.stopPropagation()}
            onDragStart={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setSettingsOpen(s => !s); }}
            title={t('widgets.floatTitle', { name: t(WIDGET_TYPE_LABEL_KEYS[widget.type]) })}
          >⚙</button>
        )}

        {isEditMode && (
          <div className="sg-widget-controls" draggable={false} onDragStart={e => e.stopPropagation()}>
            <div className="sg-widget-controls-info">
              <span className="sg-widget-name">{t(WIDGET_TYPE_LABEL_KEYS[widget.type])}</span>
              <span className="sg-widget-size">{widget.w}×{widget.h}</span>
            </div>
            <div className="sg-widget-actions">
              <button className="sg-widget-action danger"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setRemoveConfirmOpen(true); }}
                title="Remove widget">✕</button>
            </div>
          </div>
        )}

        {showHeader && (
          <header className="sg-widget-header">
            <h3 className="sg-widget-title">{resolvedTitle}</h3>
          </header>
        )}

        <div className="sg-widget-body">
          <WidgetErrorBoundary widgetId={widget.id} onRemove={() => removeWidget(widget.id)} t={t}>
            <CrashProbe widgetId={widget.id}>
              {entry.renderComponent(widget.data, handleUpdateData, settingsOpen, widget.id)}
            </CrashProbe>
          </WidgetErrorBoundary>
        </div>
      </div>

      {floatingPanel}

      {removeConfirmOpen && createPortal(
        <div className="sg-modal-confirm-backdrop" onPointerDown={() => setRemoveConfirmOpen(false)}>
          <div className="sg-modal-confirm-dialog" onPointerDown={e => e.stopPropagation()}>
            <div className="sg-modal-confirm-title">Remove Widget</div>
            <p className="sg-modal-confirm-body">
              Remove this widget from the dashboard?
            </p>
            <div className="sg-modal-confirm-actions">
              <button className="sg-modal-confirm-btn sg-modal-confirm-btn--cancel" onClick={() => setRemoveConfirmOpen(false)}>
                Cancel
              </button>
              <button className="sg-modal-confirm-btn sg-modal-confirm-btn--confirm" onClick={() => { setRemoveConfirmOpen(false); pushHistory('editHistory.removedWidget'); removeWidget(widget.id); }}>
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
