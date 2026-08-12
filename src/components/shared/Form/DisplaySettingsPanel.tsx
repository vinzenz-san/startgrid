import type { DisplaySettings } from '../../../types/widget';
import SettingsSlider from './SettingsSlider';
import { useSettings } from '../../../contexts/SettingsContext';
import './FontSettingsPanel.css'; // reuses the generic .sg-fs-panel column layout

interface Props {
  value:    DisplaySettings | undefined;
  onChange: (patch: Partial<DisplaySettings>) => void;
  /** The widget's own "no override" font size (e.g. Clock 42, Greeting 22) —
   *  shown as the slider's resting value until the user actually moves it. */
  defaultFontSize?: number;
  /** The widget's own CSS padding (currently 12px everywhere this panel is used). */
  defaultPadding?: number;
  /** Hide the Padding slider entirely — for widgets whose outer inset is
   *  fixed to the shared --sg-widget-inset token (index.css) and not meant
   *  to be user-adjustable (e.g. Greeting). Default true (shown). */
  showPadding?: boolean;
}

/**
 * Generic "Display Settings" block — Font Size / Scale /
 * Rotation, plus a StartGrid-specific Padding control (lets a widget's own
 * text sit closer to its box edge than the fixed 12px default). Reusable
 * the same way as FontSettingsPanel: any widget adds
 * `displaySettings?: DisplaySettings` to its own data type.
 */
export default function DisplaySettingsPanel({ value, onChange, defaultFontSize = 42, defaultPadding = 12, showPadding = true }: Props) {
  const { t } = useSettings();
  const ds = value ?? {};

  const resetTitle = t('widget.resetToDefault');

  return (
    <div className="sg-fs-panel" onClick={e => e.stopPropagation()}>
      <SettingsSlider
        label={t('widget.displaySettings.fontSize')}
        value={ds.fontSize ?? defaultFontSize}
        min={2}
        max={100}
        step={2}
        valueFormatter={v => `${v}px`}
        onChange={v => onChange({ fontSize: v })}
        defaultValue={defaultFontSize}
        resetTitle={resetTitle}
      />

      <SettingsSlider
        label={t('widget.displaySettings.scale')}
        value={ds.scale ?? 1}
        min={0}
        max={3}
        step={0.1}
        valueFormatter={v => `${v.toFixed(1)}x`}
        onChange={v => onChange({ scale: v })}
        defaultValue={1}
        resetTitle={resetTitle}
      />

      <SettingsSlider
        label={t('widget.displaySettings.rotation')}
        value={ds.rotation ?? 0}
        min={-180}
        max={180}
        step={1}
        valueFormatter={v => `${v}°`}
        onChange={v => onChange({ rotation: v })}
        defaultValue={0}
        resetTitle={resetTitle}
      />

      {showPadding && (
        <SettingsSlider
          label={t('widget.displaySettings.padding')}
          value={ds.padding ?? defaultPadding}
          min={0}
          max={48}
          step={2}
          valueFormatter={v => `${v}px`}
          onChange={v => onChange({ padding: v })}
          defaultValue={defaultPadding}
          resetTitle={resetTitle}
        />
      )}
    </div>
  );
}
