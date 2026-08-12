import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { WIDGET_MENU_TYPES, WIDGET_REGISTRY, WIDGET_TYPE_LABEL_KEYS } from '../widgets/registry';
import { buildNewWidget } from '../../lib/gridUtils';
import type { WidgetType } from '../../types/widget';
import './CommandPalette.css';

// Global Ctrl+K launcher for adding a widget by fuzzy(-ish) name search
// instead of scrolling the Add-Widget menu — same "raw document keydown
// listener, no shared shortcut registry" pattern BookmarkSearch.tsx already
// uses for its own Ctrl+Shift+F, since the codebase has no shared shortcut
// system and one more standalone listener isn't worth inventing one for.
export default function CommandPalette() {
  const { widgets, addWidget } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { pushHistory } = useEditHistory();
  const { developerOptionsEnabled, t } = useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) { setQuery(''); inputRef.current?.focus(); }
  }, [open]);

  const types = useMemo(() => WIDGET_MENU_TYPES.filter(wt => !WIDGET_REGISTRY[wt].devOnly || developerOptionsEnabled), [developerOptionsEnabled]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(type => t(WIDGET_TYPE_LABEL_KEYS[type]).toLowerCase().includes(q));
  }, [types, query, t]);

  function addAndClose(type: WidgetType) {
    pushHistory('editHistory.addedWidget');
    addWidget(buildNewWidget(widgets, gridConfig.columns, type));
    setOpen(false);
  }

  if (!open) return null;

  return createPortal(
    <div className="sg-cmdk-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="sg-cmdk-panel" onPointerDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="sg-cmdk-input"
          type="text"
          placeholder={t('commandPalette.placeholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) addAndClose(results[0]);
          }}
        />
        <div className="sg-cmdk-list sg-scroll-thin">
          {results.length === 0 ? (
            <div className="sg-cmdk-empty">{t('commandPalette.noResults')}</div>
          ) : (
            results.map(type => (
              <button key={type} className="sg-cmdk-item" onClick={() => addAndClose(type)}>
                <span className="sg-cmdk-item-icon">{WIDGET_REGISTRY[type].icon}</span>
                {t(WIDGET_TYPE_LABEL_KEYS[type])}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
