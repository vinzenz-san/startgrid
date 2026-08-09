import { useState, useEffect, useRef } from 'react';
import type { BookmarksData as BookmarkFolderData, BookmarkSortMode, BookmarkIconOverride } from '../../../types/widget';
import { SettingsRow, SegmentedControl, SettingsSlider, SettingsSwitch, Dropdown } from '../../shared/Form';
import { useBookmarkFolder } from './useBookmarkFolder';
import type { BmNode } from './bookmarks.mock';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import type { TranslationKey } from '../../../i18n';
import './BookmarkFolder.css';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// ── Helpers ────────────────────────────────────────────────────────────────────

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function faviconUrl(hostname: string): string {
  return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

// Mirrors Quicklinks.tsx's processIconUpload exactly (same size/dimension limits).
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

// ── Sorting ────────────────────────────────────────────────────────────────────

function applySorting(items: BmNode[], mode: BookmarkSortMode): BmNode[] {
  if (mode === 'original') return items;
  const byTitle = (a: BmNode, b: BmNode) =>
    (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  if (mode === 'alphabetical') return [...items].sort(byTitle);
  // foldersFirst: folders A-Z, then bookmarks in original database order
  const folders   = items.filter(n => !n.url).sort(byTitle);
  const bookmarks = items.filter(n =>  n.url);
  return [...folders, ...bookmarks];
}

// ── Folder picker (settings only) ─────────────────────────────────────────────

function findAncestorIds(nodes: BmNode[], targetId: string): Set<string> {
  const result = new Set<string>();
  function walk(node: BmNode): boolean {
    if (node.id === targetId) return true;
    for (const child of node.children ?? []) {
      if (walk(child)) { result.add(node.id); return true; }
    }
    return false;
  }
  for (const node of nodes) walk(node);
  return result;
}

interface FolderPickerNodeProps {
  node:        BmNode;
  selectedId:  string;
  onSelect:    (id: string, title: string) => void;
  depth:       number;
  expandedIds: Set<string>;
}

function FolderPickerNode({ node, selectedId, onSelect, depth, expandedIds }: FolderPickerNodeProps) {
  const { t } = useSettings();
  const [open, setOpen] = useState(() => (expandedIds ?? new Set<string>()).has(node.id));
  const subFolders = node.children?.filter(c => !c.url) ?? [];

  if (!node.id) {
    return (
      <>
        {subFolders.map(f => (
          <FolderPickerNode key={f.id} node={f} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} expandedIds={expandedIds} />
        ))}
      </>
    );
  }

  return (
    <div className="sg-bf-fp-node" style={{ paddingLeft: depth > 0 ? depth * 6 : 0 }}>
      <div
        className={`sg-bf-fp-row${selectedId === node.id ? ' sg-bf-fp-row--selected' : ''}`}
        onClick={() => onSelect(node.id, node.title)}
      >
        <span
          className="sg-bf-fp-arrow"
          onClick={e => { e.stopPropagation(); if (subFolders.length > 0) setOpen(o => !o); }}
        >
          {subFolders.length > 0 && (
            <span className="sg-bf-fp-toggle">{open ? '▾' : '▸'}</span>
          )}
        </span>
        <span className="sg-bf-fp-icon">📁</span>
        <span className="sg-bf-fp-name">{node.title || t('widget.bookmarkFolder.rootFallback')}</span>
      </div>
      {open && subFolders.map(f => (
        <FolderPickerNode key={f.id} node={f} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} expandedIds={expandedIds ?? new Set()} />
      ))}
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         BookmarkFolderData;
  onUpdateData: (patch: Partial<BookmarkFolderData>) => void;
}

export function BookmarkFolderSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const bookmarks = useBookmarkFolder();
  const [tree, setTree]               = useState<BmNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rootChildren, setRootChildren]               = useState<BmNode[]>([]);
  const [rootChildrenLoading, setRootChildrenLoading] = useState(true);
  const [editingIconId, setEditingIconId]             = useState<string | null>(null);
  const [iconOverridesOpen, setIconOverridesOpen]     = useState(false);

  useEffect(() => {
    setTreeLoading(true);
    bookmarks.getTree().then(t => {
      setTree(t);
      setTreeLoading(false);
      const topLevel = t[0]?.children ?? [];
      setExpandedIds(findAncestorIds(topLevel, selectedId));
    }).catch(() => setTreeLoading(false));
  }, [bookmarks.permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedId = data.rootFolderId ?? '1';

  // Icon-override editor list: only the selected root folder's direct
  // bookmark (non-folder) children — matches what the widget itself scopes
  // overrides to.
  useEffect(() => {
    setRootChildrenLoading(true);
    setEditingIconId(null);
    bookmarks.getChildren(selectedId).then(children => {
      setRootChildren(children.filter(c => !!c.url));
      setRootChildrenLoading(false);
    }).catch(() => setRootChildrenLoading(false));
  }, [selectedId, bookmarks.permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateOverride = (id: string, patch: Partial<BookmarkIconOverride>) => {
    const next = { ...(data.iconOverrides ?? {}) };
    next[id] = { ...next[id], ...patch };
    onUpdateData({ iconOverrides: next });
  };

  return (
    <div className="sg-bf-settings sg-scroll-thin" onClick={e => e.stopPropagation()}>
      <SettingsSlider
        label={t('widget.quicklinks.iconSize')}
        value={data.iconSize ?? 30}
        min={18}
        max={48}
        step={2}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ iconSize: v })}
      />
      <SettingsRow label={t('widget.quicklinks.showTitles')}>
        <SettingsSwitch checked={data.showTitles ?? true} onChange={v => onUpdateData({ showTitles: v })} />
      </SettingsRow>
      <SettingsSlider
        label={t('widget.quicklinks.textSize')}
        value={data.textSize ?? 13}
        min={9}
        max={20}
        step={1}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ textSize: v })}
      />
      <SettingsRow label={t('widget.quicklinks.layout')}>
        <Dropdown
          options={[
            { value: 'grid', label: t('widget.quicklinks.layoutGrid') },
            { value: 'list', label: t('widget.quicklinks.layoutList') },
          ]}
          value={data.layout ?? 'list'}
          onChange={v => onUpdateData({ layout: v as BookmarkFolderData['layout'] })}
        />
      </SettingsRow>
      <SettingsRow label={t('widget.quicklinks.alignment')}>
        <Dropdown
          options={[
            { value: 'left',   label: t('widget.quicklinks.align.left') },
            { value: 'center', label: t('widget.quicklinks.align.center') },
            { value: 'right',  label: t('widget.quicklinks.align.right') },
            { value: 'top',    label: t('widget.quicklinks.align.top') },
            { value: 'bottom', label: t('widget.quicklinks.align.bottom') },
          ]}
          value={data.alignment ?? 'left'}
          onChange={v => onUpdateData({ alignment: v as BookmarkFolderData['alignment'] })}
        />
      </SettingsRow>
      <SettingsRow label={t('widget.bookmarkFolder.sortOrder')}>
        <Dropdown
          options={[
            { value: 'original',      label: t('widget.bookmarkFolder.sortOriginal') },
            { value: 'foldersFirst',  label: t('widget.bookmarkFolder.sortFoldersFirst') },
            { value: 'alphabetical',  label: t('widget.bookmarkFolder.sortAlphabetical') },
          ]}
          value={data?.sortingMode ?? 'original'}
          onChange={v => onUpdateData({ sortingMode: v as BookmarkSortMode })}
        />
      </SettingsRow>

      <div className="sg-bf-settings-divider" />

      <button
        className="sg-bf-io-toggle"
        onClick={() => setIconOverridesOpen(o => !o)}
        aria-expanded={iconOverridesOpen}
      >
        <span className="sg-bf-settings-label">{t('widget.bookmarkFolder.iconOverrides')}</span>
        <span className="sg-bf-io-toggle-chevron">{iconOverridesOpen ? '∨' : '›'}</span>
      </button>
      {iconOverridesOpen && (
      <p className="sg-form-hint">{t('widget.bookmarkFolder.iconOverridesNote')}</p>
      )}
      {iconOverridesOpen && (rootChildrenLoading ? (
        <p className="sg-form-hint">{t('widget.bookmarkFolder.loading')}</p>
      ) : rootChildren.length === 0 ? (
        <p className="sg-form-hint">{t('widget.bookmarkFolder.noOverridableItems')}</p>
      ) : (
        <div className="sg-bf-io-list">
          {rootChildren.map(child => {
            const override = data.iconOverrides?.[child.id] ?? {};
            return (
              <div key={child.id} className="sg-bf-io-row">
                {editingIconId === child.id ? (
                  <div className="sg-bf-io-edit">
                    <SettingsRow label={t('widget.quicklinks.icon')}>
                      <SegmentedControl
                        options={[
                          { value: 'auto',       label: t('widget.quicklinks.iconAuto') },
                          { value: 'custom-url', label: t('widget.quicklinks.iconUrl') },
                          { value: 'upload',     label: t('widget.quicklinks.iconUpload') },
                        ]}
                        value={override.iconSource ?? 'auto'}
                        onChange={v => updateOverride(child.id, { iconSource: v, customIcon: undefined })}
                      />
                    </SettingsRow>
                    {override.iconSource === 'custom-url' && (
                      <input className="sg-bf-io-input" placeholder={t('widget.quicklinks.imageUrlPlaceholder')} draggable={false}
                        value={override.customIcon ?? ''}
                        onChange={e => updateOverride(child.id, { customIcon: e.target.value || undefined })}
                        onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()} />
                    )}
                    {override.iconSource === 'upload' && (
                      <div className="sg-bf-io-upload-row">
                        {override.customIcon && <img className="sg-bf-io-upload-preview" src={override.customIcon} alt="" />}
                        <label className="sg-bf-io-upload-label">
                          {override.customIcon ? t('widget.quicklinks.changeImage') : t('widget.quicklinks.chooseImage')}
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const dataUrl = await processIconUpload(file, t);
                              if (dataUrl) updateOverride(child.id, { customIcon: dataUrl });
                              e.target.value = '';
                            }}
                            onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} />
                        </label>
                        {override.customIcon && (
                          <button className="sg-bf-io-action-btn danger" onClick={() => updateOverride(child.id, { customIcon: undefined })}>✕</button>
                        )}
                      </div>
                    )}
                    <SettingsRow label={t('widget.quicklinks.whiteBadge')}>
                      <SettingsSwitch
                        checked={override.showWhiteBadge ?? false}
                        onChange={v => updateOverride(child.id, { showWhiteBadge: v })}
                        label={t('widget.quicklinks.whiteBadgeSwitchLabel')}
                      />
                    </SettingsRow>
                    <button className="sg-bf-io-action-btn" onClick={() => setEditingIconId(null)}>{t('widget.quicklinks.done')}</button>
                  </div>
                ) : (
                  <div className="sg-bf-io-summary">
                    <span className="sg-bf-io-name">{child.title || child.url}</span>
                    <button className="sg-bf-io-action-btn" onClick={() => setEditingIconId(child.id)}>{t('widget.quicklinks.edit')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="sg-bf-settings-divider" />

      <span className="sg-bf-settings-label">{t('widget.bookmarkFolder.rootFolder')}</span>
      {bookmarks.needsPermission ? (
        <div className="sg-bf-permission-prompt">
          <p className="sg-form-hint">{t('widget.bookmarkFolder.permissionNeeded')}</p>
          <button className="sg-bf-io-action-btn" onClick={bookmarks.requestAccess}>
            {t('widget.bookmarkFolder.grantAccess')}
          </button>
        </div>
      ) : bookmarks.isMock && !bookmarks.checkingPermission && (
        <p className="sg-form-hint">{t('widget.bookmarkFolder.mockNote')}</p>
      )}
      {treeLoading ? (
        <p className="sg-form-hint">{t('widget.bookmarkFolder.loading')}</p>
      ) : (
        <div className="sg-bf-fp-tree sg-scroll-thin">
          {tree[0]?.children?.map(n => (
            <FolderPickerNode
              key={n.id}
              node={n}
              selectedId={selectedId}
              onSelect={(id) => onUpdateData({ rootFolderId: id })}
              depth={0}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item row ───────────────────────────────────────────────────────────────────

interface ItemRowProps {
  node:           BmNode;
  iconSize:       number;
  showTitle:      boolean;
  textSize:       number;
  onFolderClick:  (node: BmNode) => void;
  override?:      BookmarkIconOverride;
  /** Tile width only applies in grid layout — list rows stretch full width. */
  applyTileWidth: boolean;
}

// Icon box is the stored px value directly; image/tile scale proportionally —
// matches Quicklinks' iconImgPx/iconTilePx exactly.
const iconImgPx  = (iconSize: number) => Math.round(iconSize * 0.65);
const iconTilePx = (iconSize: number) => Math.round(iconSize * 1.6);

function ItemRow({ node, iconSize, showTitle, textSize, onFolderClick, override, applyTileWidth }: ItemRowProps) {
  const { t } = useSettings();
  const [iconError, setIconError] = useState(false);
  const [customImgError, setCustomImgError] = useState(false);
  const isFolder    = !node.url;
  const hostname    = node.url ? hostnameOf(node.url) : '';
  const favicon     = hostname ? faviconUrl(hostname) : null;
  const initial     = (node.title || node.url || '?').charAt(0).toUpperCase();
  const iconSource  = override?.iconSource ?? 'auto';
  const cls         = `sg-bf-item${isFolder ? ' sg-bf-item--folder' : ''}`;
  const tileStyle   = applyTileWidth ? { width: iconTilePx(iconSize) } : undefined;
  const iconCls     = 'sg-bf-item-icon';
  const iconStyle   = { width: iconSize, height: iconSize };
  const imgPx       = iconImgPx(iconSize);
  const imgStyle    = { width: imgPx, height: imgPx };
  const titleCls    = 'sg-bf-item-title';
  const titleStyle  = { fontSize: textSize };
  const fallback    = <span className={iconCls} style={iconStyle}><span className="sg-bf-icon-fallback">{initial}</span></span>;

  let icon: React.ReactNode;
  if (isFolder) {
    icon = <span className={iconCls} style={iconStyle}><span className="sg-bf-icon-emoji">📁</span></span>;
  } else if (iconSource !== 'auto' && override?.customIcon) {
    icon = customImgError ? fallback : (
      <span className={`${iconCls} sg-bf-item-icon--favicon${override.showWhiteBadge ? ' sg-bf-item-icon--white-badge' : ''}`} style={iconStyle}>
        <img src={override.customIcon} alt="" style={imgStyle} onError={() => setCustomImgError(true)} />
      </span>
    );
  } else if (favicon && !iconError) {
    icon = (
      <span className={`${iconCls} sg-bf-item-icon--favicon${override?.showWhiteBadge ? ' sg-bf-item-icon--white-badge' : ''}`} style={iconStyle}>
        <img src={favicon} alt="" style={imgStyle} onError={() => setIconError(true)} />
      </span>
    );
  } else {
    icon = fallback;
  }

  if (isFolder) {
    return (
      <div className={cls} style={tileStyle} title={node.title} onClick={() => onFolderClick(node)}>
        {icon}
        {showTitle && <span className={titleCls} style={titleStyle}>{node.title || t('widget.bookmarkFolder.unnamedFolder')}</span>}
        <span className="sg-bf-item-chevron">›</span>
      </div>
    );
  }

  return (
    <a className={cls} style={tileStyle} href={node.url} title={node.title}>
      {icon}
      {showTitle && <span className={titleCls} style={titleStyle}>{node.title || hostname || node.url}</span>}
    </a>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────

interface NavEntry { id: string; name: string; }

interface Props {
  data:         BookmarkFolderData;
  onUpdateData: (patch: Partial<BookmarkFolderData>) => void;
}

export default function BookmarkFolder({ data, onUpdateData }: Props) {
  const { t } = useSettings();
  const bookmarks    = useBookmarkFolder();
  const rootFolderId = data.rootFolderId ?? '1';

  const [navStack, setNavStack] = useState<NavEntry[]>([]);
  const [rootName, setRootName] = useState(t('widget.bookmarkFolder.defaultRootName'));
  const [items,    setItems]    = useState<BmNode[]>([]);
  const [loading,  setLoading]  = useState(true);

  const currentId = navStack.length > 0 ? navStack[navStack.length - 1].id : rootFolderId;
  // Tracks the previously-active root so the icon-override reset below only
  // fires on a genuine root-folder change, never on initial mount.
  const prevRootIdRef = useRef(rootFolderId);

  // Reset navigation when root folder changes; sync folderTitle so resolveDynamicTitle stays current
  useEffect(() => {
    setNavStack([]);
    bookmarks.getNode(rootFolderId).then(node => {
      const folderName = node?.title || t('widget.bookmarkFolder.defaultRootName');
      setRootName(folderName);
      if (data.folderTitle !== folderName) {
        onUpdateData({ folderTitle: folderName });
      }
    });
    // Icon overrides are scoped to the currently-selected root folder only —
    // switching to a different root folder discards them (per product decision,
    // not carried over like Quicklinks' permanent per-link fields).
    if (prevRootIdRef.current !== rootFolderId) {
      prevRootIdRef.current = rootFolderId;
      if (data.iconOverrides && Object.keys(data.iconOverrides).length > 0) {
        onUpdateData({ iconOverrides: {} });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootFolderId, bookmarks.permissionState]);

  // Load children for current folder
  useEffect(() => {
    setLoading(true);
    bookmarks.getChildren(currentId)
      .then(children => {
        setItems(children);
        setLoading(false);
        // Self-heal: a root-level bookmark that was deleted (or moved) elsewhere
        // leaves a dead iconOverrides entry behind — prune it the next time the
        // root folder's children are actually fetched, rather than letting stale
        // entries accumulate indefinitely.
        if (currentId === rootFolderId && data.iconOverrides) {
          const validIds = new Set(children.map(c => c.id));
          const entries  = Object.entries(data.iconOverrides);
          const pruned   = entries.filter(([id]) => validIds.has(id));
          if (pruned.length !== entries.length) {
            onUpdateData({ iconOverrides: Object.fromEntries(pruned) });
          }
        }
      })
      .catch(() => setLoading(false));
  }, [currentId, bookmarks.permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  function enterFolder(node: BmNode) {
    setNavStack(prev => [...prev, { id: node.id, name: node.title || t('widget.bookmarkFolder.folderFallback') }]);
  }

  function goToBreadcrumb(index: number) {
    setNavStack(prev => prev.slice(0, index));
  }

  const breadcrumbs  = [{ id: rootFolderId, name: rootName }, ...navStack];
  const displayItems = applySorting(items, data?.sortingMode ?? 'original');
  const iconSize      = data.iconSize ?? 30;
  const showTitles    = data.showTitles ?? true;
  const textSize      = data.textSize ?? 13;
  const alignment     = data.alignment ?? 'left';
  // Icon overrides only ever apply to the root folder's own direct children —
  // navigating into a subfolder shows those items with no overrides at all.
  const overridesActive = currentId === rootFolderId;

  return (
    <div className="sg-bf">
      {/* Header — only shown when navigated into a subfolder */}
      {navStack.length > 0 && (
        <div className="sg-bf-header">
          <div className="sg-bf-breadcrumb">
            {breadcrumbs.map((entry, idx) => (
              <span key={`${entry.id}-${idx}`} className="sg-bf-breadcrumb-item">
                {idx > 0 && <span className="sg-bf-breadcrumb-sep">›</span>}
                <button
                  className={`sg-bf-breadcrumb-btn${idx === breadcrumbs.length - 1 ? ' sg-bf-breadcrumb-btn--current' : ''}`}
                  onClick={() => goToBreadcrumb(idx)}
                >
                  {entry.name}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="sg-bf-body sg-scroll-thin">
        {bookmarks.isMock && !isScreenshotMode() && (
          <div className="sg-bf-preview-badge">{t('widget.bookmarkFolder.previewBadge')}</div>
        )}
        {bookmarks.needsPermission ? (
          <div className="sg-bf-empty sg-bf-permission-prompt">
            <span className="sg-bf-empty-icon">🔒</span>
            <span className="sg-bf-empty-text">{t('widget.bookmarkFolder.permissionNeeded')}</span>
            <button className="sg-bf-io-action-btn" onClick={bookmarks.requestAccess}>
              {t('widget.bookmarkFolder.grantAccess')}
            </button>
          </div>
        ) : loading ? (
          <div className="sg-bf-empty">
            <span className="sg-bf-empty-text">{t('widget.bookmarkFolder.loading')}</span>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="sg-bf-empty">
            <span className="sg-bf-empty-icon">📁</span>
            <span className="sg-bf-empty-text">{t('widget.bookmarkFolder.folderEmpty')}</span>
          </div>
        ) : (
          <div className={`sg-bf-list${data.layout === 'grid' ? ' sg-bf-list--grid' : ''} sg-bf-list--align-${alignment}`}>
            {displayItems.map(item => (
              <ItemRow
                key={item.id}
                node={item}
                iconSize={iconSize}
                showTitle={showTitles}
                textSize={textSize}
                onFolderClick={enterFolder}
                override={overridesActive ? data.iconOverrides?.[item.id] : undefined}
                applyTileWidth={data.layout === 'grid'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
