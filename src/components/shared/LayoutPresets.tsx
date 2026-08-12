import { useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { ActionButton } from './Form';
import LayoutPresetPicker from './LayoutPresetPicker';

export default function LayoutPresets() {
  const { t } = useSettings();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <ActionButton variant="ghost" onClick={() => setPickerOpen(true)}>
        {t('widgets.presets.pickLayout')}
      </ActionButton>

      <LayoutPresetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
