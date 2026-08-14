import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { WIDGET_MENU_TYPES, WIDGET_REGISTRY, WIDGET_TYPE_LABEL_KEYS } from '../widgets/registry';
import { buildNewWidget } from '../../lib/gridUtils';
import type { WidgetType } from '../../types/widget';
import './CommandPalette.css';

interface Props {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}

// Global Ctrl+K launcher for adding a widget by fuzzy(-ish) name search.
// `open` is lifted into Grid.tsx so the bottom bar's Add Widget button can
// also open this same picker — one viewport-safe (centered, portal-rendered)
// UI instead of that button's own small anchored dropdown, which had no
// flip/shift and could run off-screen on narrow windows.
export default function CommandPalette({ open, onOpenChange }: Props) {
  const { widgets, addWidget } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { pushHistory } = useEditHistory();
  const { developerOptionsEnabled, t } = useSettings();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpenChange(o => !o);
      } else if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

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
    onOpenChange(false);
  }

  if (!open) return null;

  return createPortal(
    <div className="sg-cmdk-backdrop" onPointerDown={() => onOpenChange(false)}>
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
