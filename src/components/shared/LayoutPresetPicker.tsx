import { createPortal } from 'react-dom';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { GRID_PRESETS, applyPreset } from '../../lib/gridPresets';
import './LayoutPresetPicker.css';

interface Props {
  open:  boolean;
  onClose: () => void;
}

// Shown once, right after the onboarding tour's final step — a bigger,
// visual pick of the same GRID_PRESETS Settings' LayoutPresets.tsx already
// exposes as a plain dropdown, so a first-run user sees the options as
// actual thumbnails instead of having to dig into Settings to find them.
// Applies immediately on click (no confirm dialog): at this point in the
// flow there's nothing precious on the grid yet to lose — just the
// first-run default (Focus) — same trust level renewedTab's own picker
// assumes for its equivalent step.
export default function LayoutPresetPicker({ open, onClose }: Props) {
  const { replaceAllWidgets } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { pushHistory } = useEditHistory();
  const { t } = useSettings();

  if (!open) return null;

  const choose = (presetId: string) => {
    pushHistory('editHistory.appliedPreset');
    replaceAllWidgets(applyPreset(presetId, gridConfig.columns));
    onClose();
  };

  return createPortal(
    <div className="sg-preset-picker-backdrop" onPointerDown={onClose}>
      <div className="sg-preset-picker-dialog" onPointerDown={e => e.stopPropagation()}>
        <div className="sg-preset-picker-title">{t('tour.presetPicker.title')}</div>
        <p className="sg-preset-picker-body">{t('tour.presetPicker.body')}</p>

        <div className="sg-preset-picker-grid">
          {GRID_PRESETS.map(preset => (
            <button
              key={preset.id}
              className="sg-preset-picker-card"
              onClick={() => choose(preset.id)}
              title={t(preset.descriptionKey)}
            >
              <div className="sg-preset-picker-thumb">
                {preset.previewImage
                  ? <img src={preset.previewImage} alt="" />
                  : <span className="sg-preset-picker-thumb-placeholder">{t(preset.labelKey)[0]}</span>}
              </div>
              <span className="sg-preset-picker-label">{t(preset.labelKey)}</span>
              <span className="sg-preset-picker-desc">{t(preset.descriptionKey)}</span>
            </button>
          ))}
        </div>

        <button className="sg-preset-picker-skip" onClick={onClose}>
          {t('tour.presetPicker.skip')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
