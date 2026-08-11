// Central grid geometry config — replaces the hardcoded column count and
// cell/gap pixel sizes that used to be duplicated across Grid.tsx,
// Grid.css, and gridUtils.ts. cellWidth/cellHeight remain independent
// fields (so the schema keeps supporting non-square cells, and any config
// saved before the Settings UI was simplified still loads unchanged), but
// the current Settings UI (SettingsPanel.tsx) only exposes a single "Cell
// Size" slider that always writes the same value to both — a square 1:1
// cell is the only shape reachable from the UI going forward.
export interface GridConfig {
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  // Stretches the grid to fill the full container width instead of sizing
  // itself to columns*cellWidth (see RGLGrid.tsx) — RenewedTab-style "Full
  // Page Grid" mode. Widgets don't get pushed out of the way while dragging
  // in this mode (no live compaction target to displace into), hence the
  // experimental-warning copy in SettingsPanel.tsx.
  fullPageGrid: boolean;
}

// Matches the previous hardcoded values exactly, so existing installs get a
// config that reproduces current on-screen layout bit-for-bit on first load.
// The Settings UI's sliders (SettingsPanel.tsx) allow columns in [4, 64] and
// cellWidth/cellHeight in [10, 200] — these defaults sit comfortably inside
// both ranges, and neither this type nor the rescale/repack logic in
// gridRescale.ts/gridUtils.ts assume any narrower bounds, so the wider
// slider limits need no other code changes to "just work".
// cellWidth/cellHeight default to 50px (matches Renewed Tab's fixed cellSize)
// — at 15 columns, the old 120px default (960px+ wide box, sized for the
// previous 8-column default) rendered wider than most viewports.
export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 15,
  cellWidth: 50,
  cellHeight: 50,
  gap: 15,
  fullPageGrid: false,
};
