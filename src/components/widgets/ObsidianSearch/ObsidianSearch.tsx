import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, offset, flip, shift, size, autoUpdate } from '@floating-ui/react';
import type { ObsidianSearchData } from '../../../types/widget';
import { SettingsSlider } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useObsidian } from '../../../hooks/useObsidian';
import { simpleSearch, openInObsidian, ObsidianError, type SearchHit, type ObsidianErrorCode } from '../../../lib/obsidianApi';
import { isExtensionEnv, isScreenshotMode } from '../../../lib/permissions';
import { vaultPathToTitle } from '../../../lib/obsidianPath';
import ObsidianConnect from '../shared/ObsidianConnect';
import ObsidianStatus from '../shared/ObsidianStatus';
import '../shared/obsidian.css';
import './ObsidianSearch.css';

const DEBOUNCE_MS = 250;

// ── Mock ──────────────────────────────────────────────────────────────────────

const MOCK_HITS: SearchHit[] = [
  { path: 'Projects/StartGrid.md',      context: '…the **obsidian** widgets branch is where the REST client lives…' },
  { path: 'Daily/2026-07-28.md',        context: '…opened **obsidian** and drafted the transport comparison…' },
  { path: 'Reference/Plugins.md',       context: '…Local REST API exposes the vault over HTTP for **obsidian**…' },
];

async function searchMock(query: string): Promise<SearchHit[]> {
  await new Promise(r => setTimeout(r, 300));
  const q = query.toLowerCase();
  return MOCK_HITS.filter(h => h.path.toLowerCase().includes(q) || h.context.toLowerCase().includes(q));
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         ObsidianSearchData;
  onUpdateData: (patch: Partial<ObsidianSearchData>) => void;
}

export function ObsidianSearchSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  return (
    <div className="sg-obs-settings" onClick={e => e.stopPropagation()}>
      <SettingsSlider
        label={t('widget.obsidianSearch.maxResults')}
        min={3} max={25} step={1}
        value={data.maxResults ?? 8}
        onChange={v => onUpdateData({ maxResults: v })}
        valueFormatter={v => String(v)}
      />
      <SettingsSlider
        label={t('widget.obsidianSearch.contextLength')}
        min={40} max={240} step={20}
        value={data.contextLength ?? 100}
        onChange={v => onUpdateData({ contextLength: v })}
        valueFormatter={v => String(v)}
      />
      <div className="sg-cal-settings-divider"/>
      <ObsidianConnect />
    </div>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function HitRow({ hit, onOpen }: { hit: SearchHit; onOpen: (path: string) => void }) {
  return (
    <div className="sg-obss-item" onClick={() => onOpen(hit.path)}>
      <div className="sg-obss-item-info">
        <span className="sg-obss-item-title">{vaultPathToTitle(hit.path)}</span>
        <span className="sg-obss-item-path">{hit.path}</span>
        {hit.context && <span className="sg-obss-item-context">{hit.context}</span>}
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  data: ObsidianSearchData;
}

export default function ObsidianSearch({ data }: Props) {
  const { t } = useSettings();
  const { isReady, checking } = useObsidian();

  const maxResults    = data.maxResults ?? 8;
  const contextLength = data.contextLength ?? 100;

  const [query,     setQuery]     = useState('');
  const [hits,      setHits]      = useState<SearchHit[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [errorCode, setErrorCode] = useState<ObsidianErrorCode | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  const isMock        = !isExtensionEnv || isScreenshotMode();
  const notConfigured = !isMock && !checking && !isReady;
  const hasQuery      = query.trim().length > 0;

  // ── Floating panel — same construction as the Bookmark Search widget ───────

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

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    refs.setReference(node);
  }, [refs]);

  useEffect(() => {
    if (!isFocused) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest('.sg-obss-float-panel')) return;
      if (containerRef.current?.contains(target)) return;
      if (target.closest('.sg-widget-float-panel')) return;
      if (target.closest('.sg-widget-gear')) return;
      setIsFocused(false);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [isFocused]);

  // ── Debounced search ──────────────────────────────────────────────────────

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setHits([]); setLoading(false); setErrorCode(null); return; }
    if (notConfigured) return;

    setLoading(true);
    const id = setTimeout(() => {
      const run = isMock ? searchMock(trimmed) : simpleSearch(trimmed, contextLength);
      run
        .then(results => { setHits(results.slice(0, maxResults)); setErrorCode(null); })
        .catch(err => {
          setHits([]);
          setErrorCode(err instanceof ObsidianError ? err.code : 'HTTP_ERROR');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(id);
  }, [query, maxResults, contextLength, isMock, notConfigured]);

  function openHit(path: string) {
    if (isMock) return;
    void openInObsidian(path).catch(() => {});
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsFocused(false);
      setQuery('');
      searchRef.current?.blur();
      return;
    }
    if (e.key === 'Enter' && hits.length > 0) openHit(hits[0].path);
  }

  const floatingPanel = isFocused && createPortal(
    <div
      ref={refs.setFloating}
      className="sg-obss-float-panel"
      style={floatingStyles}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="sg-obss-float-body sg-scroll-thin">
        {isMock && !isScreenshotMode() && <div className="sg-cal-preview-badge">{t('widget.obsidian.previewBadge')}</div>}

        {notConfigured ? (
          <ObsidianStatus code="NOT_CONFIGURED"/>
        ) : errorCode ? (
          <ObsidianStatus code={errorCode}/>
        ) : !hasQuery ? (
          <div className="sg-obss-empty">
            <span className="sg-obss-empty-icon">⌕</span>
            <span className="sg-obss-empty-text">{t('widget.obsidianSearch.typeToSearch')}</span>
          </div>
        ) : loading ? (
          <div className="sg-obss-empty">
            <span className="sg-obss-empty-text">{t('widget.obsidianSearch.loading')}</span>
          </div>
        ) : hits.length === 0 ? (
          <div className="sg-obss-empty">
            <span className="sg-obss-empty-icon">⌕</span>
            <span className="sg-obss-empty-text">{t('widget.obsidianSearch.noResults')}</span>
          </div>
        ) : (
          <div className="sg-obss-list">
            {hits.map(hit => <HitRow key={hit.path} hit={hit} onOpen={openHit}/>)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <div ref={setContainerRef} className="sg-obss" onKeyDown={handleKeyDown}>
        <div className="sg-obss-search-row">
          <span className="sg-obss-search-icon">⌕</span>
          <input
            ref={searchRef}
            className="sg-obss-search"
            type="text"
            placeholder={t('widget.obsidianSearch.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onPointerDown={e => e.stopPropagation()}
          />
          {query && (
            <button
              className="sg-obss-clear"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
            >✕</button>
          )}
        </div>
      </div>
      {floatingPanel}
    </>
  );
}
