import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, flip, shift, offset, autoUpdate } from '@floating-ui/react';
import type { QuickLink, QuicklinksData } from '../../../types/widget';
import { SettingsRow, SettingsSlider, SettingsSwitch, Dropdown } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { scaledFontSize } from '../../../lib/displayStyle';
import { normalizeUrl, isDangerousUrlScheme } from '../../../lib/urlUtils';
import { openLink } from '../../../lib/openLink';
import type { TranslationKey } from '../../../i18n';
import './Quicklinks.css';

const DEFAULT_TEXT_SIZE = 13;
const DEFAULT_ICON_SIZE = 30;

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function faviconChain(hostname: string): string[] {
  if (!hostname) return [];
  return [
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain=${hostname}&default=404`,
    `https://unavatar.io/${hostname}?fallback=clear`,
  ];
}

async function processIconUpload(file: File, t: TFn): Promise<string | null> {
  if (file.size > 32 * 1024) { alert(t('widget.quicklinks.imageTooLarge')); return null; }
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width > 64 || img.height > 64) {
          alert(t('widget.quicklinks.imageDimensionsTooLarge', { w: img.width, h: img.height }));
          resolve(null);
        } else { resolve(dataUrl); }
      };
      img.onerror = () => { alert(t('widget.quicklinks.couldNotReadImage')); resolve(null); };
      img.src = dataUrl;
    };
    reader.onerror = () => { alert(t('widget.quicklinks.couldNotReadFile')); resolve(null); };
    reader.readAsDataURL(file);
  });
}

function displayTitle(link: QuickLink): string {
  if (link.title) return link.title;
  try { return new URL(link.url).hostname.replace(/^www\./, ''); } catch { return link.url; }
}

function generateId() {
  return `ql-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Single link item ───────────────────────────────────────────────────────

const INTERNAL_URL = /^(about|chrome|edge|moz-extension|file):/i;

function clipboardFallback(url: string, t: TFn) {
  navigator.clipboard.writeText(url).catch(() => {});
  alert(t('widget.quicklinks.internalUrlClipboard', { url }));
}

function openInternalUrl(url: string, newTab: boolean, t: TFn) {
  if (/^file:/i.test(url) && !confirm(t('widget.quicklinks.confirmFileUrl', { url }))) return;
  const inExtension = typeof browser !== 'undefined' && !!browser.tabs;
  if (inExtension) {
    const action = newTab ? openLink(url, true) : browser.tabs.update({ url });
    action.catch(() => clipboardFallback(url, t));
  } else { clipboardFallback(url, t); }
}

interface LinkItemProps {
  link: QuickLink;
  iconSize: number;
  showTitle: boolean;
  showWhiteBadge: boolean;
  textSize: string;
  /** Tile width only applies in grid/row layout — list rows stretch full width. */
  applyTileWidth: boolean;
}

// Icon box is the stored px value directly; image/tile scale proportionally
// so they still look right across the full 18-48px slider range, not just
// the 3 fixed stops (22/30/40) the old S/M/L classes covered exactly.
const iconImgPx  = (iconSize: number) => Math.round(iconSize * 0.65);
const iconTilePx = (iconSize: number) => Math.round(iconSize * 1.6);

function LinkItem({ link, iconSize, showTitle, showWhiteBadge, textSize, applyTileWidth }: LinkItemProps) {
  const { t } = useSettings();
  const [faviconIdx, setFaviconIdx] = useState(0);
  const [customImgError, setCustomImgError] = useState(false);
  const isInternal = INTERNAL_URL.test(link.url);
  const isDangerous = !isInternal && isDangerousUrlScheme(link.url);
  const label = displayTitle(link);
  const iconSource = link.iconSource ?? 'auto';
  const hostname = hostnameOf(link.url);
  const chain = faviconChain(hostname);
  const faviconSrc = chain[faviconIdx] ?? null;
  const fallback = <span className="sg-ql-fallback">{label.charAt(0).toUpperCase()}</span>;
  const imgPx = iconImgPx(iconSize);
  const imgStyle = { width: imgPx, height: imgPx };

  let iconInner: React.ReactNode;
  let isFaviconImg: boolean;
  if (iconSource !== 'auto' && link.customIcon) {
    iconInner = customImgError ? fallback : <img src={link.customIcon} alt="" draggable={false} style={imgStyle} onError={() => setCustomImgError(true)} />;
    isFaviconImg = !customImgError;
  } else if (iconSource === 'auto' && link.customIcon) {
    iconInner = link.customIcon.startsWith('data:')
      ? <img src={link.customIcon} alt="" draggable={false} style={imgStyle} />
      : <span className="sg-ql-emoji">{link.customIcon}</span>;
    isFaviconImg = link.customIcon.startsWith('data:');
  } else {
    iconInner = faviconSrc ? <img src={faviconSrc} alt="" draggable={false} style={imgStyle} onError={() => setFaviconIdx(i => i + 1)} /> : fallback;
    isFaviconImg = !!faviconSrc;
  }

  const iconContent = (
    <span
      className={`sg-ql-icon${isFaviconImg ? ' sg-ql-icon--favicon' : ''}${showWhiteBadge && isFaviconImg ? ' sg-ql-icon--white-badge' : ''}`}
      style={{ width: iconSize, height: iconSize }}
    >
      {iconInner}
    </span>
  );

  const titleStyle = { fontSize: textSize };
  const tileStyle = applyTileWidth ? { width: iconTilePx(iconSize) } : undefined;

  if (isDangerous) {
    return (
      <button className="sg-ql-link" style={tileStyle} title={t('widget.quicklinks.unsupportedUrlScheme')}
        onClick={() => alert(t('widget.quicklinks.unsupportedUrlScheme'))}>
        {iconContent}
        {showTitle && <span className="sg-ql-title" style={titleStyle}>{label}</span>}
      </button>
    );
  }

  if (isInternal) {
    return (
      <button
        className="sg-ql-link"
        style={tileStyle}
        title={label}
        onMouseDown={e => { if (e.button === 1) { e.preventDefault(); openInternalUrl(link.url, true, t); } }}
        onClick={() => openInternalUrl(link.url, false, t)}
      >
        {iconContent}
        {showTitle && <span className="sg-ql-title" style={titleStyle}>{label}</span>}
      </button>
    );
  }

  return (
    <a
      className="sg-ql-link"
      style={tileStyle}
      href={link.url}
      title={label}
      draggable={false}
    >
      {iconContent}
      {showTitle && <span className="sg-ql-title" style={titleStyle}>{label}</span>}
    </a>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: QuicklinksData;
  onUpdateData: (patch: Partial<QuicklinksData>) => void;
}

export function QuicklinksSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const [newUrl, setNewUrl] = useState('');
  const [linksPanelOpen, setLinksPanelOpen] = useState(false);

  const { refs: linksRefs, floatingStyles: linksFloatingStyles } = useFloating({
    placement: 'right-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!linksPanelOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest('.sg-dropdown-menu')) return;
      const referenceEl = linksRefs.reference.current as Element | null;
      if (!referenceEl?.contains(target) && !linksRefs.floating.current?.contains(target))
        setLinksPanelOpen(false);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [linksPanelOpen, linksRefs.floating, linksRefs.reference]);

  const iconSize   = data.iconSize   ?? DEFAULT_ICON_SIZE;
  const showTitles = data.showTitles ?? true;
  const layout     = data.layout     ?? 'grid';
  const alignment  = data.alignment  ?? 'left';

  const ALIGNMENT_OPTIONS = [
    { value: 'left',   label: t('widget.quicklinks.align.left') },
    { value: 'center', label: t('widget.quicklinks.align.center') },
    { value: 'right',  label: t('widget.quicklinks.align.right') },
    { value: 'top',    label: t('widget.quicklinks.align.top') },
    { value: 'bottom', label: t('widget.quicklinks.align.bottom') },
  ];

  const updateLink = (id: string, patch: Partial<QuickLink>) =>
    onUpdateData({ links: data.links.map(l => l.id === id ? { ...l, ...patch } : l) });

  const removeLink = (id: string) => {
    onUpdateData({ links: data.links.filter(l => l.id !== id) });
  };

  const addLink = () => {
    if (!newUrl.trim()) return;
    const fullUrl = normalizeUrl(newUrl);
    if (!fullUrl) { alert(t('widget.quicklinks.unsupportedUrlScheme')); return; }
    onUpdateData({ links: [...data.links, { id: generateId(), url: fullUrl, showTitle: true }] });
    setNewUrl('');
  };

  const moveLink = (id: string, dir: -1 | 1) => {
    const links = [...data.links];
    const idx = links.findIndex(l => l.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= links.length) return;
    [links[idx], links[swap]] = [links[swap], links[idx]];
    onUpdateData({ links });
  };

  return (
    <div className="sg-ql-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.quicklinks.layout')}>
        <Dropdown
          options={[{ value: 'grid', label: t('widget.quicklinks.layoutGrid') }, { value: 'list', label: t('widget.quicklinks.layoutList') }]}
          value={layout}
          onChange={v => onUpdateData({ layout: v })}
        />
      </SettingsRow>

      <SettingsSlider
        label={t('widget.quicklinks.iconSize')}
        value={iconSize}
        min={18}
        max={48}
        step={2}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ iconSize: v })}
        defaultValue={DEFAULT_ICON_SIZE}
      />

      <SettingsRow label={t('widget.quicklinks.showTitles')}>
        <SettingsSwitch checked={showTitles} onChange={v => onUpdateData({ showTitles: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.quicklinks.alignment')}>
        <Dropdown
          options={ALIGNMENT_OPTIONS}
          value={alignment}
          onChange={v => onUpdateData({ alignment: v as QuicklinksData['alignment'] })}
        />
      </SettingsRow>

      <button
        ref={linksRefs.setReference}
        className="sg-ql-manage-links-btn"
        onClick={e => { e.stopPropagation(); setLinksPanelOpen(o => !o); }}
      >
        {t('widget.quicklinks.manageLinks', { count: data.links.length })}
      </button>

      {linksPanelOpen && createPortal(
        <div
          ref={linksRefs.setFloating}
          className="sg-ql-links-panel sg-scroll-thin"
          style={linksFloatingStyles}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="sg-widget-float-header">
            <span className="sg-widget-float-title">{t('widget.quicklinks.manageLinksTitle')}</span>
            <button className="sg-widget-float-close" onClick={() => setLinksPanelOpen(false)} title={t('settings.close')}>✕</button>
          </div>

          <div className="sg-ql-table">
            <div className="sg-ql-table-header">
              <span>{t('widget.quicklinks.urlPlaceholder')}</span>
              <span>{t('widget.quicklinks.name')}</span>
              <span>{t('widget.quicklinks.icon')}</span>
              <span>{t('widget.quicklinks.badge')}</span>
              <span />
            </div>
            <div className="sg-ql-table-body">
              {data.links.map((link, idx) => (
                <div key={link.id} className="sg-ql-table-group">
                  <div className="sg-ql-table-row">
                    <input className="sg-ql-input" placeholder={t('widget.quicklinks.urlPlaceholder')} draggable={false}
                      value={link.url} onChange={e => updateLink(link.id, { url: e.target.value })}
                      onBlur={e => {
                        const raw = e.target.value.trim();
                        if (!raw) return;
                        const normalized = normalizeUrl(raw);
                        if (!normalized) { alert(t('widget.quicklinks.unsupportedUrlScheme')); updateLink(link.id, { url: '' }); return; }
                        if (normalized !== link.url) updateLink(link.id, { url: normalized });
                      }}
                      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                      onDragStart={e => e.stopPropagation()} />
                    <input className="sg-ql-input" placeholder={t('widget.quicklinks.titlePlaceholder')} draggable={false}
                      value={link.title ?? ''} onChange={e => updateLink(link.id, { title: e.target.value || undefined })}
                      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                      onDragStart={e => e.stopPropagation()} />
                    <div onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                      <Dropdown
                        menuWidth="auto"
                        options={[
                          { value: 'auto',       label: t('widget.quicklinks.iconAuto') },
                          { value: 'custom-url', label: t('widget.quicklinks.iconUrl') },
                          { value: 'upload',     label: t('widget.quicklinks.iconUpload') },
                        ]}
                        value={link.iconSource ?? 'auto'}
                        onChange={v => updateLink(link.id, { iconSource: v as QuickLink['iconSource'], customIcon: undefined })}
                      />
                    </div>
                    <SettingsSwitch
                      checked={link.showWhiteBadge ?? false}
                      onChange={v => updateLink(link.id, { showWhiteBadge: v })}
                      label={t('widget.quicklinks.whiteBadgeSwitchLabel')}
                    />
                    <div className="sg-ql-table-actions">
                      <button className="sg-ql-action-btn" title={t('widget.quicklinks.moveUp')}   onClick={() => moveLink(link.id, -1)} disabled={idx === 0}>↑</button>
                      <button className="sg-ql-action-btn" title={t('widget.quicklinks.moveDown')} onClick={() => moveLink(link.id, 1)}  disabled={idx === data.links.length - 1}>↓</button>
                      <button className="sg-ql-action-btn danger" title={t('widget.quicklinks.delete')} onClick={() => removeLink(link.id)}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                      </button>
                    </div>
                  </div>
                  {link.iconSource === 'custom-url' && (
                    <div className="sg-ql-table-subrow">
                      <input className="sg-ql-input" placeholder={t('widget.quicklinks.imageUrlPlaceholder')} draggable={false}
                        value={link.customIcon ?? ''}
                        onChange={e => updateLink(link.id, { customIcon: e.target.value || undefined })}
                        onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()} />
                    </div>
                  )}
                  {link.iconSource === 'upload' && (
                    <div className="sg-ql-table-subrow">
                      <div className="sg-ql-upload-row">
                        {link.customIcon && <img className="sg-ql-upload-preview" src={link.customIcon} alt="" />}
                        <label className="sg-ql-upload-label">
                          {link.customIcon ? t('widget.quicklinks.changeImage') : t('widget.quicklinks.chooseImage')}
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const dataUrl = await processIconUpload(file, t);
                              if (dataUrl) updateLink(link.id, { customIcon: dataUrl });
                              e.target.value = '';
                            }}
                            onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} />
                        </label>
                        {link.customIcon && (
                          <button className="sg-ql-action-btn danger" onClick={() => updateLink(link.id, { customIcon: undefined })}>✕</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="sg-ql-add-row">
            <input className="sg-ql-input" placeholder={t('widget.quicklinks.addUrlPlaceholder')} draggable={false}
              value={newUrl} onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addLink(); }}
              onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
              onDragStart={e => e.stopPropagation()} />
            <button className="sg-ql-action-btn primary" onClick={addLink}>＋</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

interface Props {
  data: QuicklinksData;
  onUpdateData: (patch: Partial<QuicklinksData>) => void;
}

export default function Quicklinks({ data, onUpdateData }: Props) {
  const { t } = useSettings();
  const { links = [], layout = 'grid' } = data;
  const iconSize    = data.iconSize   ?? DEFAULT_ICON_SIZE;
  const showTitles  = data.showTitles ?? true;
  const textSize    = scaledFontSize(DEFAULT_TEXT_SIZE);
  const alignment   = data.alignment  ?? 'left';

  const containerRef                    = useRef<HTMLDivElement>(null);
  const [compact,   setCompact]         = useState(false);
  const [dragIndex, setDragIndex]       = useState<number | null>(null);
  const [overIndex, setOverIndex]       = useState<number | null>(null);
  // Set true the instant a real drag (past the pixel threshold) completes;
  // consumed by the item's own click-capture guard below so the browser's
  // synthesized post-drag click never navigates. A ref, not state — it must
  // be readable synchronously by the very next click, before any re-render.
  const justDraggedRef                  = useRef(false);

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

  // Explorer-style drag: the entire item tile is the drag target.
  // Listeners go on `document` so pointermove fires before pointer capture is
  // acquired (capture is deferred until the 4px threshold to let clicks through).
  const handleItemDown = (e: React.PointerEvent<HTMLDivElement>, startIdx: number) => {
    e.stopPropagation(); // always: prevents grid widget drag from starting

    const startX     = e.clientX;
    const startY     = e.clientY;
    const pointerId  = e.pointerId;
    const tileEl     = e.currentTarget; // HTMLDivElement — has setPointerCapture
    const startLinks = [...links];
    const horiz      = effectiveLayout === 'row' || effectiveLayout === 'grid';

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
      // elementFromPoint sees through the dragged item (pointer-events:none on it)
      const el   = document.elementFromPoint(ev.clientX, ev.clientY);
      const item = el?.closest('[data-ql-index]') as HTMLElement | null;
      if (!item) return;
      const itemIdx = Number(item.dataset.qlIndex);
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
      // A drag occurred: the browser synthesizes a `click` after this pointerup
      // (targeting the capture element in Chrome, the original <a> in Firefox).
      // Flag it so the item's own onClickCapture (always-mounted, no
      // registration-timing window) swallows that click regardless of which
      // element it lands on.
      justDraggedRef.current = true;
      const adjusted = currentOver > startIdx ? currentOver - 1 : currentOver;
      if (adjusted !== startIdx) {
        const next = [...startLinks];
        const [removed] = next.splice(startIdx, 1);
        next.splice(adjusted, 0, removed);
        onUpdateData({ links: next });
      }
      setDragIndex(null);
      setOverIndex(null);
    };

    document.addEventListener('pointermove',   onMove);
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className="sg-ql"
      ref={containerRef}
    >
      {links.length === 0 ? (
        <div className="sg-ql sg-ql--empty">
          <span className="sg-ql-empty">{t('widget.quicklinks.emptyState')}</span>
        </div>
      ) : (
        <div className={`sg-ql-links sg-scroll-thin sg-ql-links--${effectiveLayout} sg-ql-links--align-${alignment}`}>
          {links.map((link, idx) => (
            <div
              key={link.id}
              className={[
                'sg-ql-item',
                !compact                            ? 'sg-ql-item--sortable'    : '',
                dragIndex === idx                   ? 'sg-ql-item--dragging'    : '',
                dragIndex !== null && overIndex === idx                                  ? 'sg-ql-item--drop-before' : '',
                dragIndex !== null && overIndex === idx + 1 && idx === links.length - 1 ? 'sg-ql-item--drop-after'  : '',
              ].filter(Boolean).join(' ')}
              data-ql-index={idx}
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
              <LinkItem
                link={link}
                iconSize={effectiveIconSize}
                showTitle={effectiveShowTitles}
                showWhiteBadge={link.showWhiteBadge ?? false}
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
