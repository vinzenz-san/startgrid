import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, offset, flip, shift, size, autoUpdate } from '@floating-ui/react';
import type { BookmarkSearchData } from '../../../types/widget';
import { SettingsSlider } from '../../shared/Form';
import { SettingsRow } from '../../shared/Form';
import { SettingsSwitch } from '../../shared/Form';
import { useBookmarkFolder } from '../BookmarkFolder/useBookmarkFolder';
import type { BmNode } from '../BookmarkFolder/bookmarks.mock';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import './BookmarkSearch.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RESULTS = 10;

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ── Item row ───────────────────────────────────────────────────────────────────

interface RowProps {
  node:            BmNode;
  onFolderClick:   (node: BmNode) => void;
  onBookmarkClick: (url: string) => void;
}

function BookmarkRow({ node, onFolderClick, onBookmarkClick }: RowProps) {
  const { t } = useSettings();
  const [iconError, setIconError] = useState(false);
  const isFolder = !node.url;
  const hostname = node.url ? hostnameOf(node.url) : '';
  const favicon  = hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : null;

  const icon = isFolder ? (
    <span className="sg-bks-item-icon">📁</span>
  ) : favicon && !iconError ? (
    <img
      className="sg-bks-item-icon sg-bks-item-icon--favicon"
      src={favicon}
      alt=""
      onError={() => setIconError(true)}
    />
  ) : (
    <span className="sg-bks-item-icon sg-bks-item-icon--initial">
      {(node.title || node.url || '?').charAt(0).toUpperCase()}
    </span>
  );

  if (isFolder) {
    return (
      <div className="sg-bks-item sg-bks-item--folder" onClick={() => onFolderClick(node)}>
        {icon}
        <span className="sg-bks-item-title">{node.title || t('widget.bookmarkSearch.folderFallback')}</span>
        <span className="sg-bks-item-chevron">›</span>
      </div>
    );
  }

  return (
    <div className="sg-bks-item" onClick={() => node.url && onBookmarkClick(node.url)}>
      {icon}
      <div className="sg-bks-item-info">
        <span className="sg-bks-item-title">{node.title || hostname}</span>
        {hostname && <span className="sg-bks-item-url">{hostname}</span>}
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         BookmarkSearchData;
  onUpdateData: (patch: Partial<BookmarkSearchData>) => void;
}

export function BookmarkSearchSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  return (
    <div className="sg-bks-settings" onClick={e => e.stopPropagation()}>
      <SettingsSlider
        label={t('widget.bookmarkSearch.maxResults')}
        min={5} max={30} step={1}
        value={data.maxResults ?? DEFAULT_MAX_RESULTS}
        onChange={v => onUpdateData({ maxResults: v })}
        valueFormatter={v => String(v)}
        defaultValue={DEFAULT_MAX_RESULTS}
      />
      <SettingsRow label={t('widget.bookmarkSearch.focusShortcut')}>
        <span className="sg-bks-shortcut-badge">Ctrl + Shift + F</span>
      </SettingsRow>
      <SettingsRow label={t('widget.bookmarkSearch.googleFallback')}>
        <SettingsSwitch
          checked={data.googleFallback ?? false}
          onChange={v => onUpdateData({ googleFallback: v })}
        />
      </SettingsRow>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────

interface NavEntry { id: string; name: string; }

interface Props {
  data:         BookmarkSearchData;
  onUpdateData: (patch: Partial<BookmarkSearchData>) => void;
}

export default function BookmarkSearch({ data }: Props) {
  const { t } = useSettings();
  const bookmarks  = useBookmarkFolder();
  const maxResults = data.maxResults ?? DEFAULT_MAX_RESULTS;

  const [query,            setQuery]            = useState('');
  const [searchResults,    setSearchResults]    = useState<BmNode[]>([]);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [folderStack,      setFolderStack]      = useState<NavEntry[]>([]);
  const [folderItems,      setFolderItems]      = useState<BmNode[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [isFocused,        setIsFocused]        = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  const isInFolder    = folderStack.length > 0;
  const currentFolder = folderStack[folderStack.length - 1];
  const hasQuery      = query.trim().length > 0;
  const panelOpen     = isFocused || isInFolder;

  // ── Floating panel setup ───────────────────────────────────────────────────

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom',
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${Math.max(rects.reference.width, 350)}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Attach the reference to the container div
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    refs.setReference(node);
  }, [refs]);

  // ── Close panel on outside click ───────────────────────────────────────────

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element;
      // Keep open: results panel, the widget body itself, the widget settings panel, gear button
      if (target.closest('.sg-bks-float-panel')) return;
      if (containerRef.current?.contains(target)) return;
      if (target.closest('.sg-widget-float-panel')) return;
      if (target.closest('.sg-widget-gear')) return;
      setIsFocused(false);
      setFolderStack([]);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [panelOpen]);

  // ── Global focus shortcut ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F' || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      setIsFocused(true);
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Derived display list — needed by handleKeyDown below (must precede it)
  const displayItems = isInFolder ? folderItems : searchResults;

  // ── Escape / Enter key ────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isInFolder) {
        setFolderStack([]);
      } else {
        setIsFocused(false);
        setQuery('');
        searchRef.current?.blur();
      }
      return;
    }
    if (e.key === 'Enter' && displayItems.length > 0) {
      const first = displayItems[0];
      if (!first.url) {
        enterFolder(first);
      } else {
        openBookmark(first.url);
      }
      return;
    }
    if (e.key === 'Enter' && displayItems.length === 0 && !isInFolder && hasQuery && data.googleFallback) {
      searchGoogle(query);
    }
  };

  // ── Live search ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (isInFolder) return;
    if (!query.trim()) { setSearchResults([]); setTotalResultCount(0); setLoading(false); return; }
    setLoading(true);
    bookmarks.search(query.trim()).then(results => {
      setTotalResultCount(results.length);
      setSearchResults(results.slice(0, maxResults));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [query, maxResults, bookmarks.permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load folder contents ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isInFolder) return;
    setLoading(true);
    bookmarks.getChildren(currentFolder.id)
      .then(items => { setFolderItems(items); setLoading(false); })
      .catch(() => setLoading(false));
  }, [folderStack, bookmarks.permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  function enterFolder(node: BmNode) {
    setFolderStack(prev => [...prev, { id: node.id, name: node.title || t('widget.bookmarkSearch.folderFallback') }]);
    setIsFocused(true);
  }

  function goBack() {
    setFolderStack(prev => prev.slice(0, -1));
  }

  function openBookmark(url: string) {
    bookmarks.openUrl(url);
  }

  function searchGoogle(q: string) {
    bookmarks.openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
  }

  // ── Floating panel content ─────────────────────────────────────────────────


  const floatingPanel = panelOpen && createPortal(
    <div
      ref={refs.setFloating}
      className="sg-bks-float-panel"
      style={floatingStyles}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Folder navigation header inside the panel */}
      {isInFolder && (
        <div className="sg-bks-float-nav">
          <button className="sg-bks-back" onClick={goBack}>‹</button>
          <span className="sg-bks-folder-name">{currentFolder.name}</span>
        </div>
      )}

      {/* Results body */}
      <div className="sg-bks-float-body sg-scroll-thin">
        {bookmarks.isMock && !isScreenshotMode() && (
          <div className="sg-bks-preview-badge">{t('widget.bookmarkSearch.previewBadge')}</div>
        )}
        {bookmarks.needsPermission ? (
          <div className="sg-bks-empty">
            <span className="sg-bks-empty-icon">🔒</span>
            <span className="sg-bks-empty-text">{t('widget.bookmarkSearch.permissionNeeded')}</span>
            <button className="sg-bks-grant-btn" onClick={bookmarks.requestAccess}>
              {t('widget.bookmarkSearch.grantAccess')}
            </button>
          </div>
        ) : loading ? (
          <div className="sg-bks-empty">
            <span className="sg-bks-empty-text">{t('widget.bookmarkSearch.loading')}</span>
          </div>
        ) : !isInFolder && !hasQuery ? (
          <div className="sg-bks-empty">
            <span className="sg-bks-empty-icon">🔍</span>
            <span className="sg-bks-empty-text">{t('widget.bookmarkSearch.typeToSearch')}</span>
          </div>
        ) : displayItems.length === 0 && !isInFolder && data.googleFallback ? (
          <div className="sg-bks-empty">
            <span className="sg-bks-empty-icon">🔍</span>
            <span className="sg-bks-empty-text">{t('widget.bookmarkSearch.noResults')}</span>
            <button className="sg-bks-grant-btn" onClick={() => searchGoogle(query)}>
              {t('widget.bookmarkSearch.searchGoogleFor', { query })}
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="sg-bks-empty">
            <span className="sg-bks-empty-icon">{isInFolder ? '📁' : '🔍'}</span>
            <span className="sg-bks-empty-text">{isInFolder ? t('widget.bookmarkSearch.folderEmpty') : t('widget.bookmarkSearch.noResults')}</span>
          </div>
        ) : (
          <div className="sg-bks-list">
            {displayItems.map(item => (
              <BookmarkRow
                key={item.id}
                node={item}
                onFolderClick={enterFolder}
                onBookmarkClick={openBookmark}
              />
            ))}
            {!isInFolder && totalResultCount > maxResults && (
              <div className="sg-bks-overflow-banner">
                {t('widget.bookmarkSearch.overflow', { n: maxResults })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  // ── Widget render (slim shell) ─────────────────────────────────────────────

  return (
    <>
      <div
        ref={setContainerRef}
        className="sg-bks"
        onKeyDown={handleKeyDown}
      >
        {isInFolder ? (
          <div className="sg-bks-folder-nav">
            <button className="sg-bks-back" onClick={goBack} onPointerDown={e => e.stopPropagation()}>‹</button>
            <span className="sg-bks-folder-name">{currentFolder.name}</span>
          </div>
        ) : (
          <div className="sg-bks-search-row">
            <span className="sg-bks-search-icon">⌕</span>
            <input
              ref={searchRef}
              className="sg-bks-search"
              type="text"
              placeholder={t('widget.bookmarkSearch.searchPlaceholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onPointerDown={e => e.stopPropagation()}
            />
            {query && (
              <button
                className="sg-bks-clear"
                onPointerDown={e => e.stopPropagation()}
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              >✕</button>
            )}
          </div>
        )}
      </div>

      {floatingPanel}
    </>
  );
}
