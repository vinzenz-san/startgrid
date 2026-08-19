import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWidgets } from './WidgetContext';
import { useGridConfig } from './GridConfigContext';
import type { Widget } from '../types/widget';
import type { GridConfig } from '../types/grid';
import type { TranslationKey } from '../i18n';

export interface EditHistoryEntry {
  labelKey: TranslationKey;
  widgets: Widget[];
  gridConfig: GridConfig;
  timestamp: number;
}

interface EditHistoryContextType {
  history: EditHistoryEntry[];
  /** Records an undoable checkpoint using widgets/gridConfig as they are
   *  *right now*, before the caller's own mutation runs. Calls sharing the
   *  same labelKey within COALESCE_MS of each other are treated as one
   *  gesture (a drag, a slider being dragged) — only the first actually
   *  snapshots; later ones just extend the coalescing window, so the
   *  recorded checkpoint stays the pre-gesture state instead of one frame
   *  into it. */
  pushHistory: (labelKey: TranslationKey) => void;
  undo: () => void;
}

const MAX_HISTORY = 10;
const COALESCE_MS = 800;

const EditHistoryContext = createContext<EditHistoryContextType | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Undo stack (max 10 entries) for layout/grid edits, wired to Ctrl/Cmd+Z.
 * Requires both `WidgetProvider` and `GridConfigProvider` above it in the
 * tree since an undo restores both widgets and gridConfig together.
 */
export function EditHistoryProvider({ children }: { children: ReactNode }) {
  const { widgets, replaceAllWidgets } = useWidgets();
  const { gridConfig, setGridConfig } = useGridConfig();
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);

  // Mutated on every render (not via useEffect) so pushHistory/undo — both
  // useCallback'd with empty dep arrays below, so they're stable references
  // safe to hand to distant callers without re-triggering their effects —
  // always see the latest values instead of a stale closure over whatever
  // widgets/gridConfig were when the provider last mounted.
  const widgetsRef      = useRef(widgets);
  const gridConfigRef   = useRef(gridConfig);
  const replaceAllRef   = useRef(replaceAllWidgets);
  const setGridConfigRef = useRef(setGridConfig);
  const historyRef      = useRef(history);
  widgetsRef.current      = widgets;
  gridConfigRef.current   = gridConfig;
  replaceAllRef.current   = replaceAllWidgets;
  setGridConfigRef.current = setGridConfig;
  historyRef.current      = history;

  const lastLabelRef    = useRef<TranslationKey | null>(null);
  const lastPushTimeRef = useRef(0);

  const pushHistory = useCallback((labelKey: TranslationKey) => {
    const now = Date.now();
    if (lastLabelRef.current === labelKey && now - lastPushTimeRef.current < COALESCE_MS) {
      lastPushTimeRef.current = now;
      return;
    }
    lastLabelRef.current = labelKey;
    lastPushTimeRef.current = now;
    setHistory(prev => [
      { labelKey, widgets: widgetsRef.current, gridConfig: gridConfigRef.current, timestamp: now },
      ...prev,
    ].slice(0, MAX_HISTORY));
  }, []);

  const undo = useCallback(() => {
    const entry = historyRef.current[0];
    if (!entry) return;
    replaceAllRef.current(entry.widgets);
    setGridConfigRef.current(entry.gridConfig);
    lastLabelRef.current = null; // whatever comes next shouldn't coalesce with the undone gesture
    setHistory(prev => prev.slice(1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (isEditableTarget(document.activeElement)) return; // let native text-undo run instead
      if (historyRef.current.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  return (
    <EditHistoryContext.Provider value={{ history, pushHistory, undo }}>
      {children}
    </EditHistoryContext.Provider>
  );
}

export function useEditHistory() {
  const ctx = useContext(EditHistoryContext);
  if (!ctx) throw new Error('useEditHistory must be used within EditHistoryProvider');
  return ctx;
}
