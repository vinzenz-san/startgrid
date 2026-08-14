import { createContext, useContext } from 'react';

// Settings sidebar is always right-docked (SettingsPanel.css .sg-settings-panel,
// no left variant currently wired up in Grid.tsx) — kept as one constant so
// WidgetContainer's floating-ui collision padding stays in sync with the
// panel's actual CSS width without reading layout at runtime.
export const SETTINGS_PANEL_WIDTH = 340;

// Lets WidgetContainer's floating panel (a sibling of SettingsPanel, not a
// descendant) know when the settings sidebar is occupying the right edge of
// the viewport, so its flip()/shift() collision middleware can steer away
// from that reserved strip instead of only avoiding the raw viewport edge.
export const SettingsPanelBoundsContext = createContext(false);

export function useSettingsPanelVisible(): boolean {
  return useContext(SettingsPanelBoundsContext);
}
