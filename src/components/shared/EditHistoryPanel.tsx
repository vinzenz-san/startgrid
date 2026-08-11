import type { CSSProperties } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { DEV_PANEL_WIDTH, type DevPanelPos } from '../DevPanel/DevPanel';
import './EditHistoryPanel.css';

const PANEL_WIDTH = 240;
const GAP = 16;

interface Props {
  /** DevPanel's live position when it's on screen, so this panel can offset
   *  itself beside it (same pattern as InspectorHistoryPanel.tsx) instead of
   *  overlapping. null when Dev Mode is off — this panel then falls back to
   *  its own default bottom-left anchor (see EditHistoryPanel.css). */
  devPanelPos: DevPanelPos | null;
}

export default function EditHistoryPanel({ devPanelPos }: Props) {
  const { t, updateSettings } = useSettings();
  const { history } = useEditHistory();

  let style: CSSProperties | undefined;
  if (devPanelPos) {
    const fitsRight = devPanelPos.x + DEV_PANEL_WIDTH + GAP + PANEL_WIDTH <= window.innerWidth;
    const left = fitsRight
      ? devPanelPos.x + DEV_PANEL_WIDTH + GAP
      : Math.max(0, devPanelPos.x - PANEL_WIDTH - GAP);
    style = { left, top: devPanelPos.y };
  }

  return (
    <div className="sg-edit-history" style={style}>
      <div className="sg-edit-history-header">
        <span className="sg-edit-history-title">{t('editHistory.panelTitle')}</span>
        <button
          className="sg-edit-history-close"
          title={t('settings.editHistoryPanelEnabled')}
          onClick={() => updateSettings({ editHistoryPanelEnabled: false })}
        >
          ×
        </button>
      </div>

      <div className="sg-edit-history-list">
        {history.length === 0 ? (
          <span className="sg-edit-history-empty">{t('editHistory.empty')}</span>
        ) : (
          history.map(entry => (
            <div key={entry.timestamp} className="sg-edit-history-item">{t(entry.labelKey)}</div>
          ))
        )}
      </div>

      <div className="sg-edit-history-note">{t('editHistory.limitNote')}</div>
      <div className="sg-edit-history-note">{t('editHistory.scopeNote')}</div>
      <div className="sg-edit-history-hint">{t('editHistory.hint')}</div>
    </div>
  );
}
