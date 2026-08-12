import { useState } from 'react';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { GRID_PRESETS, applyPreset } from '../../lib/gridPresets';
import { SettingsRow, Dropdown, ActionButton } from './Form';
import ConfirmDialog from './ConfirmDialog';
import type { Widget } from '../../types/widget';

export default function LayoutPresets() {
  const { replaceAllWidgets } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { pushHistory } = useEditHistory();
  const { t } = useSettings();
  const [presetId, setPresetId] = useState(GRID_PRESETS[0].id);
  // Set when a destructive replace-all-widgets action (applying a preset) is
  // staged and waiting on the confirm dialog below.
  const [pendingWidgets, setPendingWidgets] = useState<Widget[] | null>(null);

  const options = GRID_PRESETS.map(p => ({ value: p.id, label: t(p.labelKey) }));
  const selectedPreset = GRID_PRESETS.find(p => p.id === presetId);

  return (
    <>
      <SettingsRow label={t('widgets.presets.sectionLabel')}>
        <Dropdown options={options} value={presetId} onChange={setPresetId} />
      </SettingsRow>
      {selectedPreset && <p className="sg-form-hint">{t(selectedPreset.descriptionKey)}</p>}
      <ActionButton variant="ghost" onClick={() => setPendingWidgets(applyPreset(presetId, gridConfig.columns))}>
        {t('widgets.presets.apply')}
      </ActionButton>

      <ConfirmDialog
        open={pendingWidgets !== null}
        onClose={() => setPendingWidgets(null)}
        onConfirm={() => {
          if (pendingWidgets) {
            pushHistory('editHistory.appliedPreset');
            replaceAllWidgets(pendingWidgets);
          }
          setPendingWidgets(null);
        }}
        title={t('widgets.presets.confirmTitle')}
        body={t('widgets.presets.confirmBody')}
        confirmLabel={t('widgets.presets.confirmButton')}
        cancelLabel={t('widgets.presets.cancelButton')}
      />
    </>
  );
}
