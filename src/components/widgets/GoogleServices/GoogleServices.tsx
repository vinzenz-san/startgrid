import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, flip, shift, offset, autoUpdate } from '@floating-ui/react';
import type { GoogleServiceAppId, GoogleServicesData } from '../../../types/widget';
import { GOOGLE_SERVICE_APPS, getGoogleServiceApp, normalizeGoogleAccount, buildGoogleServiceUrl } from '../../../lib/googleServicesApps';
import { SettingsRow, SettingsSlider, SettingsSwitch, Dropdown } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGoogleAuth } from '../../../hooks/useGoogleAuth';
import { scaledFontSize } from '../../../lib/displayStyle';
import './GoogleServices.css';

const DEFAULT_TEXT_SIZE = 13;
const DEFAULT_ICON_SIZE = 30;

function faviconChain(hostname: string): string[] {
  return [
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain=${hostname}&default=404`,
    `https://unavatar.io/${hostname}?fallback=clear`,
  ];
}

function IconConnect() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Single app tile ─────────────────────────────────────────────────────────

const iconImgPx  = (iconSize: number) => Math.round(iconSize * 0.65);
const iconTilePx = (iconSize: number) => Math.round(iconSize * 1.6);

interface AppTileProps {
  appId: GoogleServiceAppId;
  account: string | undefined;
  iconSize: number;
  showTitle: boolean;
  textSize: string;
  applyTileWidth: boolean;
}

function AppTile({ appId, account, iconSize, showTitle, textSize, applyTileWidth }: AppTileProps) {
  const { t } = useSettings();
  const app = getGoogleServiceApp(appId);
  const [faviconIdx, setFaviconIdx] = useState(0);
  if (!app) return null;

  const label = t(app.labelKey);
  // Google's own branded icon first, then the generic favicon chain as
  // fallback if that specific URL ever 404s.
  const chain = [app.brandIconUrl, ...faviconChain(app.domain)];
  const faviconSrc = chain[faviconIdx] ?? null;
  const imgPx = iconImgPx(iconSize);
  const fallback = <span className="sg-gs-fallback">{label.charAt(0).toUpperCase()}</span>;
  const tileStyle = applyTileWidth ? { width: iconTilePx(iconSize) } : undefined;
  const titleStyle = { fontSize: textSize };

  return (
    <a
      className="sg-gs-link"
      style={tileStyle}
      href={buildGoogleServiceUrl(app, account)}
      title={label}
      target="_blank"
      rel="noreferrer"
      draggable={false}
    >
      <span className="sg-gs-icon" style={{ width: iconSize, height: iconSize }}>
        {faviconSrc
          ? <img src={faviconSrc} alt="" draggable={false} style={{ width: imgPx, height: imgPx }} onError={() => setFaviconIdx(i => i + 1)} />
          : fallback}
      </span>
      {showTitle && <span className="sg-gs-title" style={titleStyle}>{label}</span>}
    </a>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

interface SettingsProps {
  data: GoogleServicesData;
  onUpdateData: (patch: Partial<GoogleServicesData>) => void;
}

export function GoogleServicesSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const { isConnected, isConnecting, email, connect, disconnect } = useGoogleAuth();
  const [appsPanelOpen, setAppsPanelOpen] = useState(false);

  const { refs: appsRefs, floatingStyles: appsFloatingStyles } = useFloating({
    placement: 'right-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!appsPanelOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest('.sg-dropdown-menu')) return;
      const referenceEl = appsRefs.reference.current as Element | null;
      if (!referenceEl?.contains(target) && !appsRefs.floating.current?.contains(target))
        setAppsPanelOpen(false);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [appsPanelOpen, appsRefs.floating, appsRefs.reference]);

  const apps         = data.apps ?? [];
  const accountMode  = data.accountMode ?? 'connected';
  const iconSize     = data.iconSize    ?? DEFAULT_ICON_SIZE;
  const showTitles   = data.showTitles  ?? true;
  const layout       = data.layout      ?? 'grid';
  const alignment    = data.alignment   ?? 'left';

  const ALIGNMENT_OPTIONS = [
    { value: 'left',   label: t('widget.googleServices.align.left') },
    { value: 'center', label: t('widget.googleServices.align.center') },
    { value: 'right',  label: t('widget.googleServices.align.right') },
    { value: 'top',    label: t('widget.googleServices.align.top') },
    { value: 'bottom', label: t('widget.googleServices.align.bottom') },
  ];

  const toggleApp = (id: GoogleServiceAppId, enabled: boolean) => {
    onUpdateData({ apps: enabled ? [...apps, id] : apps.filter(a => a !== id) });
  };

  const moveApp = (id: GoogleServiceAppId, dir: -1 | 1) => {
    const next = [...apps];
    const idx = next.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onUpdateData({ apps: next });
  };

  const curated = GOOGLE_SERVICE_APPS.filter(a => a.curated);
  const more    = GOOGLE_SERVICE_APPS.filter(a => !a.curated);

  const renderAppRow = (appId: GoogleServiceAppId, labelKey: (typeof GOOGLE_SERVICE_APPS)[number]['labelKey']) => {
    const enabled = apps.includes(appId);
    const idx = apps.indexOf(appId);
    return (
      <div key={appId} className="sg-gs-app-row">
        <SettingsSwitch checked={enabled} onChange={v => toggleApp(appId, v)} label={t(labelKey)} />
        <span className="sg-gs-app-label">{t(labelKey)}</span>
        {/* Always mounted (just hidden) so toggling a checkbox never changes
            row height — an enabled-only mount caused the panel to resize and
            @floating-ui's autoUpdate to reposition it, i.e. visible jitter. */}
        <div className={`sg-gs-app-actions${enabled ? '' : ' sg-gs-app-actions--hidden'}`}>
          <button className="sg-ql-action-btn" title={t('widget.quicklinks.moveUp')}   onClick={() => moveApp(appId, -1)} disabled={!enabled || idx === 0}>↑</button>
          <button className="sg-ql-action-btn" title={t('widget.quicklinks.moveDown')} onClick={() => moveApp(appId, 1)}  disabled={!enabled || idx === apps.length - 1}>↓</button>
        </div>
      </div>
    );
  };

  return (
    <div className="sg-ql-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.googleServices.accountMode')}>
        <Dropdown
          options={[
            { value: 'connected', label: t('widget.googleServices.accountModeConnected') },
            { value: 'custom',    label: t('widget.googleServices.accountModeCustom') },
          ]}
          value={accountMode}
          onChange={v => onUpdateData({ accountMode: v as GoogleServicesData['accountMode'] })}
        />
      </SettingsRow>

      {accountMode === 'custom' ? (
        <>
          <SettingsRow label={t('widget.googleServices.accountModeCustom')}>
            <input
              className="sg-obs-input"
              type="text"
              placeholder={t('widget.googleServices.customAccountPlaceholder')}
              defaultValue={data.customAccount ?? ''}
              onBlur={e => onUpdateData({ customAccount: normalizeGoogleAccount(e.target.value) })}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onDragStart={e => e.stopPropagation()}
            />
          </SettingsRow>
          <p className="sg-obs-hint">{t('widget.googleServices.customAccountHint')}</p>
        </>
      ) : (
        <div className="sg-cal-settings-section">
          {isConnected ? (
            <>
              <p className="sg-cal-account-email">{t('widget.googleServices.connectedAs', { email: email ?? '' })}</p>
              <button className="sg-cal-connect-btn sg-cal-connect-btn--disconnect" onClick={disconnect}>
                {t('widget.googleServices.disconnect')}
              </button>
            </>
          ) : (
            <button className="sg-cal-connect-btn" onClick={connect} disabled={isConnecting}>
              <IconConnect/> {isConnecting ? t('widget.googleServices.connecting') : t('widget.googleServices.connect')}
            </button>
          )}
        </div>
      )}

      <div className="sg-ql-settings-row" style={{ width: '100%' }}>
        <SettingsRow label={t('widget.googleServices.layout')}>
          <Dropdown
            options={[{ value: 'grid', label: t('widget.googleServices.layoutGrid') }, { value: 'list', label: t('widget.googleServices.layoutList') }]}
            value={layout}
            onChange={v => onUpdateData({ layout: v })}
          />
        </SettingsRow>
      </div>

      <SettingsSlider
        label={t('widget.googleServices.iconSize')}
        value={iconSize}
        min={18}
        max={48}
        step={2}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ iconSize: v })}
        defaultValue={DEFAULT_ICON_SIZE}
      />

      <SettingsRow label={t('widget.googleServices.showTitles')}>
        <SettingsSwitch checked={showTitles} onChange={v => onUpdateData({ showTitles: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.googleServices.alignment')}>
        <Dropdown
          options={ALIGNMENT_OPTIONS}
          value={alignment}
          onChange={v => onUpdateData({ alignment: v as GoogleServicesData['alignment'] })}
        />
      </SettingsRow>

      <button
        ref={appsRefs.setReference}
        className="sg-ql-manage-links-btn"
        onClick={e => { e.stopPropagation(); setAppsPanelOpen(o => !o); }}
      >
        {t('widget.googleServices.manageApps', { count: apps.length })}
      </button>

      {appsPanelOpen && createPortal(
        <div
          ref={appsRefs.setFloating}
          className="sg-ql-links-panel sg-scroll-thin"
          style={appsFloatingStyles}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="sg-widget-float-header">
            <span className="sg-widget-float-title">{t('widget.googleServices.manageAppsTitle')}</span>
            <button className="sg-widget-float-close" onClick={() => setAppsPanelOpen(false)} title={t('settings.close')}>✕</button>
          </div>

          <span className="sg-ql-settings-label">{t('widget.googleServices.curatedSection')}</span>
          <div className="sg-gs-app-list">
            {curated.map(a => renderAppRow(a.id, a.labelKey))}
          </div>

          <span className="sg-ql-settings-label">{t('widget.googleServices.moreAppsSection')}</span>
          <div className="sg-gs-app-list">
            {more.map(a => renderAppRow(a.id, a.labelKey))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────

interface Props {
  data: GoogleServicesData;
  onUpdateData: (patch: Partial<GoogleServicesData>) => void;
}

export default function GoogleServices({ data, onUpdateData }: Props) {
  const { t } = useSettings();
  const { isConnected, email } = useGoogleAuth();
  const apps       = data.apps ?? [];
  const layout     = data.layout     ?? 'grid';
  const iconSize   = data.iconSize   ?? DEFAULT_ICON_SIZE;
  const showTitles = data.showTitles ?? true;
  const textSize   = scaledFontSize(DEFAULT_TEXT_SIZE);
  const alignment  = data.alignment  ?? 'left';

  const account = data.accountMode === 'custom'
    ? (data.customAccount ? normalizeGoogleAccount(data.customAccount) : undefined)
    : (isConnected ? email : undefined);

  const containerRef              = useRef<HTMLDivElement>(null);
  const [compact,   setCompact]   = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const justDraggedRef            = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setCompact(entries[0].contentRect.height < 96);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveLayout     = compact ? 'row' : layout;
  const effectiveIconSize   = compact ? 18    : iconSize;
  const effectiveShowTitles = compact ? false : showTitles;

  const handleItemDown = (e: React.PointerEvent<HTMLDivElement>, startIdx: number) => {
    e.stopPropagation();

    const startX    = e.clientX;
    const startY    = e.clientY;
    const pointerId = e.pointerId;
    const tileEl    = e.currentTarget;
    const startApps = [...apps];
    const horiz     = effectiveLayout === 'row' || effectiveLayout === 'grid';

    let isDragging  = false;
    let currentOver = startIdx;

    const onMove = (ev: PointerEvent) => {
      if (!isDragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        isDragging = true;
        tileEl.setPointerCapture(pointerId);
        setDragIndex(startIdx);
        setOverIndex(startIdx);
      }
      const el   = document.elementFromPoint(ev.clientX, ev.clientY);
      const item = el?.closest('[data-gs-index]') as HTMLElement | null;
      if (!item) return;
      const itemIdx = Number(item.dataset.gsIndex);
      if (isNaN(itemIdx)) return;
      const rect   = item.getBoundingClientRect();
      const before = horiz
        ? ev.clientX < rect.left + rect.width  / 2
        : ev.clientY < rect.top  + rect.height / 2;
      currentOver = before ? itemIdx : itemIdx + 1;
      setOverIndex(currentOver);
    };

    const onUp = () => {
      document.removeEventListener('pointermove',   onMove);
      document.removeEventListener('pointerup',     onUp);
      document.removeEventListener('pointercancel', onUp);
      if (!isDragging) return;
      justDraggedRef.current = true;
      const adjusted = currentOver > startIdx ? currentOver - 1 : currentOver;
      if (adjusted !== startIdx) {
        const next = [...startApps];
        const [removed] = next.splice(startIdx, 1);
        next.splice(adjusted, 0, removed);
        onUpdateData({ apps: next });
      }
      setDragIndex(null);
      setOverIndex(null);
    };

    document.addEventListener('pointermove',   onMove);
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="sg-ql" ref={containerRef}>
      {apps.length === 0 ? (
        <div className="sg-ql sg-ql--empty">
          <span className="sg-ql-empty">{t('widget.googleServices.emptyState')}</span>
        </div>
      ) : (
        <div className={`sg-ql-links sg-scroll-thin sg-ql-links--${effectiveLayout} sg-ql-links--align-${alignment}`}>
          {apps.map((appId, idx) => (
            <div
              key={appId}
              className={[
                'sg-ql-item',
                !compact                                 ? 'sg-ql-item--sortable'    : '',
                dragIndex === idx                        ? 'sg-ql-item--dragging'    : '',
                dragIndex !== null && overIndex === idx  ? 'sg-ql-item--drop-before' : '',
                dragIndex !== null && overIndex === idx + 1 && idx === apps.length - 1 ? 'sg-ql-item--drop-after' : '',
              ].filter(Boolean).join(' ')}
              data-gs-index={idx}
              onPointerDown={!compact ? e => handleItemDown(e, idx) : undefined}
              onMouseDown={!compact ? e => e.stopPropagation() : undefined}
              onDragStart={e => e.preventDefault()}
              onClickCapture={e => {
                if (justDraggedRef.current) {
                  justDraggedRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <AppTile
                appId={appId}
                account={account}
                iconSize={effectiveIconSize}
                showTitle={effectiveShowTitles}
                textSize={textSize}
                applyTileWidth={effectiveLayout === 'grid' || effectiveLayout === 'row'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
