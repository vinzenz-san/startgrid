import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useStorage } from '../hooks/useStorage';
import { GridConfig, DEFAULT_GRID_CONFIG } from '../types/grid';

interface GridConfigContextType {
  gridConfig: GridConfig;
  setGridConfig: (next: GridConfig) => void;
  loaded: boolean;
}

const Ctx = createContext<GridConfigContextType | null>(null);

/**
 * Persists grid geometry (columns, cell size, gap) via `useStorage` and
 * mirrors it onto CSS custom properties (`--grid-cols`, `--cell-w`, etc.) so
 * Grid.css can consume it without a build step. Does not itself orchestrate
 * widget rescaling on a config change — see `useApplyGridConfig` for that.
 */
export function GridConfigProvider({ children }: { children: ReactNode }) {
  const [storedGridConfig, setGridConfigRaw, loaded] = useStorage<GridConfig>('gridConfig', DEFAULT_GRID_CONFIG);

  // Defensive merge against DEFAULT_GRID_CONFIG: useStorage overwrites the
  // default wholesale with whatever JSON was stored rather than merging
  // field-by-field, so a config saved by an older version of this schema
  // (missing a field this version expects) would otherwise surface as
  // `undefined` instead of falling back to a sane default.
  const gridConfig: GridConfig = { ...DEFAULT_GRID_CONFIG, ...storedGridConfig };

  // Injected as runtime CSS custom properties (same pattern as ThemeContext's
  // --widget-bg-color etc.) so Grid.css can consume user-configured grid
  // geometry without a build-time step. index.css keeps static fallback
  // values for the pre-hydration flash, same spirit as its dark-background
  // anti-flash trick.
  // cellWidth/cellHeight are read independently here on purpose — this
  // context has no opinion on whether they're equal. The Settings UI's
  // single "Cell Size" slider is what keeps them in sync going forward by
  // always writing the same value to both; this context just passes
  // whatever's stored straight through to --cell-w/--cell-h.
  useEffect(() => {
    document.documentElement.style.setProperty('--grid-cols', String(gridConfig.columns));
    document.documentElement.style.setProperty('--cell-w', `${gridConfig.cellWidth}px`);
    document.documentElement.style.setProperty('--cell-h', `${gridConfig.cellHeight}px`);
    document.documentElement.style.setProperty('--gap', `${gridConfig.gap}px`);
  }, [gridConfig.columns, gridConfig.cellWidth, gridConfig.cellHeight, gridConfig.gap]);

  // Plain passthrough setter — the rescale orchestration (capturing the old
  // config, running rescaleWidgets, committing both config + widgets) lives
  // at the call site (Settings UI), which already has both this context and
  // WidgetContext in scope. Keeping this context free of a WidgetContext
  // dependency keeps it independently testable and avoids a provider-order
  // dependency between the two.
  const setGridConfig = (next: GridConfig) => setGridConfigRaw(next);

  return (
    <Ctx.Provider value={{ gridConfig, setGridConfig, loaded }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGridConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGridConfig must be used within GridConfigProvider');
  return ctx;
}
