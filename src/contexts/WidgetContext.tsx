import { createContext, useContext, type ReactNode } from 'react';
import { useStorage } from '../hooks/useStorage';
import type { Widget } from '../types/widget';
import { assertWidget } from '../lib/widgetGuards';
import { applyPreset } from '../lib/gridPresets';
import { DEFAULT_GRID_CONFIG } from '../types/grid';

// First-run layout, and what a factory reset (BackupRestore.tsx's
// performFactoryReset — clears storage, so useStorage falls back to this
// same default) lands on. Built from the Focus preset itself (LayoutPresets.tsx)
// rather than a hand-duplicated widget list, so it can't drift out of sync
// with what "Focus" actually produces.
const DEFAULT_WIDGETS: Widget[] = applyPreset('focus', DEFAULT_GRID_CONFIG.columns);

interface WidgetContextType {
  widgets: Widget[];
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  removeWidget: (id: string) => void;
  addWidget: (widget: Omit<Widget, 'id'>) => Widget;
  /** Bulk replace — used by the grid-rescale flow (useApplyGridConfig) to
   *  commit a whole recalculated layout in one write, rather than patching
   *  widgets one at a time. */
  replaceAllWidgets: (next: Widget[]) => void;
  loaded: boolean;
}

const WidgetContext = createContext<WidgetContextType | null>(null);

/**
 * Owns the widget list (persisted via `useStorage('widgets', ...)`) and its
 * CRUD operations. Falls back to the "Focus" layout preset on first run or
 * after a factory reset.
 */
export function WidgetProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets, loaded] = useStorage<Widget[]>('widgets', DEFAULT_WIDGETS);

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } as Widget : w));
  };

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const addWidget = (widget: Omit<Widget, 'id'>): Widget => {
    // See assertWidget's own doc for why this cast is needed and how it's checked.
    const newWidget = assertWidget({ ...widget, id: `w-${Date.now()}` });
    setWidgets(prev => [...prev, newWidget]);
    return newWidget;
  };

  const replaceAllWidgets = (next: Widget[]) => setWidgets(next);

  return (
    <WidgetContext.Provider value={{ widgets, updateWidget, removeWidget, addWidget, replaceAllWidgets, loaded }}>
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidgets() {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error('useWidgets must be used within WidgetProvider');
  return ctx;
}
