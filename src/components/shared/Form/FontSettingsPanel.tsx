import { useRef, useState } from 'react';
import type { FontSettings } from '../../../types/widget';
import SettingsRow from './SettingsRow';
import SettingsSwitch from './SettingsSwitch';
import SettingsSlider from './SettingsSlider';
import Dropdown from './Dropdown';
import CustomColorPicker from '../CustomColorPicker';
import { useSettings } from '../../../contexts/SettingsContext';
import './FontSettingsPanel.css';

interface Props {
  value:    FontSettings | undefined;
  onChange: (patch: Partial<FontSettings>) => void;
}

const WEIGHT_OPTIONS = ['', '100', '300', '400', '500', '700', '900'] as const;

/**
 * Generic, per-widget "Font Settings" block (Font family,
 * Weight, Italic, Underline, Colour + Use Accent Color, Text outline). Any
 * widget data type that adds `fontSettings?: FontSettings` can render this
 * inside its own <DetailedSettings title={t('widget.fontSettings.title')}>.
 */
export default function FontSettingsPanel({ value, onChange }: Props) {
  const { t } = useSettings();
  const fs = value ?? {};

  const colorBtnRef        = useRef<HTMLButtonElement>(null);
  const outlineColorBtnRef = useRef<HTMLButtonElement>(null);
  const [colorPickerOpen, setColorPickerOpen]               = useState(false);
  const [outlineColorPickerOpen, setOutlineColorPickerOpen] = useState(false);

  const colorValue        = fs.color ?? '#ffffff';
  const outlineColorValue = fs.textOutlineColor ?? '#000000';

  const WEIGHT_LABELS: Record<typeof WEIGHT_OPTIONS[number], string> = {
    '':    t('widget.fontSettings.weightDefault'),
    '100': t('widget.fontSettings.weightThin'),
    '300': t('widget.fontSettings.weightLight'),
    '400': t('widget.fontSettings.weightRegular'),
    '500': t('widget.fontSettings.weightMedium'),
    '700': t('widget.fontSettings.weightBold'),
    '900': t('widget.fontSettings.weightBlack'),
  };

  return (
    <div className="sg-fs-panel" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.fontSettings.fontFamily')}>
        <input
          className="sg-fs-input"
          placeholder={t('widget.fontSettings.fontFamilyPlaceholder')}
          value={fs.fontFamily ?? ''}
          onChange={e => onChange({ fontFamily: e.target.value || undefined })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.fontSettings.weight')}>
        <Dropdown
          options={WEIGHT_OPTIONS.map(v => ({ value: v, label: WEIGHT_LABELS[v] }))}
          value={(fs.fontWeight ? String(fs.fontWeight) : '') as typeof WEIGHT_OPTIONS[number]}
          onChange={v => onChange({ fontWeight: v ? Number(v) : undefined })}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.fontSettings.italic')}>
        <SettingsSwitch checked={fs.italic ?? false} onChange={v => onChange({ italic: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.fontSettings.underline')}>
        <SettingsSwitch checked={fs.underline ?? false} onChange={v => onChange({ underline: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.fontSettings.colour')}>
        <div className="sg-fs-color-row">
          <button
            ref={colorBtnRef}
            className="sg-fs-color-btn"
            style={{ background: colorValue, opacity: fs.useAccentColor ? 0.5 : 1 }}
            title={t('widget.fontSettings.pickColour')}
            disabled={fs.useAccentColor}
            onClick={() => setColorPickerOpen(o => !o)}
            onPointerDown={e => e.stopPropagation()}
          />
          <SettingsSwitch
            checked={fs.useAccentColor ?? false}
            onChange={v => onChange({ useAccentColor: v })}
            label={t('widget.fontSettings.useAccentColor')}
          />
        </div>
      </SettingsRow>

      <CustomColorPicker
        value={colorValue}
        onChange={color => onChange({ color })}
        anchorRef={colorBtnRef}
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        onReset={() => onChange({ color: undefined })}
        isDefault={fs.color === undefined}
      />

      <SettingsRow label={t('widget.fontSettings.textOutline')}>
        <SettingsSwitch checked={fs.textOutline ?? false} onChange={v => onChange({ textOutline: v })} />
      </SettingsRow>

      {fs.textOutline && (
        <>
          <SettingsRow label={t('widget.fontSettings.outlineStyle')}>
            <Dropdown
              options={[
                { value: 'basic',    label: t('widget.fontSettings.outlineStyleBasic') },
                { value: 'advanced', label: t('widget.fontSettings.outlineStyleAdvanced') },
              ]}
              value={fs.textOutlineStyle ?? 'basic'}
              onChange={v => onChange({ textOutlineStyle: v as FontSettings['textOutlineStyle'] })}
            />
          </SettingsRow>

          <SettingsRow label={t('widget.fontSettings.outlineColour')}>
            <button
              ref={outlineColorBtnRef}
              className="sg-fs-color-btn"
              style={{ background: outlineColorValue }}
              title={t('widget.fontSettings.pickOutlineColour')}
              onClick={() => setOutlineColorPickerOpen(o => !o)}
              onPointerDown={e => e.stopPropagation()}
            />
          </SettingsRow>

          <CustomColorPicker
            value={outlineColorValue}
            onChange={color => onChange({ textOutlineColor: color })}
            anchorRef={outlineColorBtnRef}
            open={outlineColorPickerOpen}
            onClose={() => setOutlineColorPickerOpen(false)}
            onReset={() => onChange({ textOutlineColor: undefined })}
            isDefault={fs.textOutlineColor === undefined}
          />

          {fs.textOutlineStyle === 'advanced' && (
            <SettingsSlider
              label={t('widget.fontSettings.outlineSize')}
              value={fs.textOutlineSize ?? 1}
              min={1}
              max={20}
              step={1}
              valueFormatter={v => `${v}px`}
              onChange={v => onChange({ textOutlineSize: v })}
              defaultValue={1}
              resetTitle={t('widget.resetToDefault')}
            />
          )}
        </>
      )}
    </div>
  );
}
