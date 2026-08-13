import IconButton from './IconButton';
import { useSettings } from '../../../contexts/SettingsContext';
import './Form.css';

interface Props {
  value:           number;
  onChange:        (value: number) => void;
  min?:            number;
  max?:            number;
  step?:           number;
  valueFormatter?: (val: number) => string;
  onPointerDown?:  (e: React.PointerEvent<HTMLInputElement>) => void;
  /** Value to restore when the reset button is clicked. Reset button only
   *  renders when this is provided, and is disabled while already at it. */
  defaultValue?:   number;
  resetTitle?:     string;
  /**
   * Visible row label. When given, this renders as a full self-contained row
   * (label 40% / reset+value 20% / track 40%, via CSS grid) — the single
   * layout every slider in the app shares, not nested inside a SettingsRow.
   * When omitted, renders the bare [reset?][track][value] control only, for
   * the rare chromeless/toolbar case (e.g. RainRadar's frame scrubber) that
   * has no room for a label column — pass `ariaLabel` there instead.
   */
  label?:          string;
  ariaLabel?:      string;
  /** Extra class(es) merged onto the root — e.g. for a one-off decorative
   *  tick mark that needs to be positioned relative to this exact element. */
  className?:      string;
}

const pct = (v: number) => `${v}%`;

export default function SettingsSlider({
  value, onChange,
  min = 0, max = 100, step = 5,
  valueFormatter = pct,
  onPointerDown,
  defaultValue,
  resetTitle,
  label,
  ariaLabel,
  className,
}: Props) {
  const { t } = useSettings();
  const resolvedResetTitle = resetTitle ?? t('widget.resetToDefault');
  // Percentage of the track that is "filled" left of the thumb. Firefox paints
  // this natively via ::-moz-range-progress; WebKit has no such pseudo-element,
  // so we expose it as a CSS var and paint a hard-stop gradient on the track.
  const fillPct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const isDefault = defaultValue !== undefined && value === defaultValue;

  const resetBtn = defaultValue !== undefined && (
    <IconButton
      className={`sg-slider-reset${isDefault ? ' sg-slider-reset--default' : ''}`}
      variant="ghost"
      title={resolvedResetTitle}
      onClick={() => onChange(defaultValue)}
      active={false}
      icon={<span aria-hidden="true">↺</span>}
    />
  );

  const track = (
    <input
      type="range"
      className="sg-slider"
      aria-label={ariaLabel ?? label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      onPointerDown={onPointerDown}
      style={{ ['--sg-slider-fill' as string]: `${fillPct}%` }}
    />
  );

  if (label === undefined) {
    return (
      <div className={`sg-slider-wrap${className ? ` ${className}` : ''}`}>
        {resetBtn}
        {track}
        <span className="sg-slider-val">{valueFormatter(value)}</span>
      </div>
    );
  }

  return (
    <div className={`sg-slider-row${className ? ` ${className}` : ''}`}>
      <span className="sg-form-label sg-slider-row-label">{label}</span>
      <div className="sg-slider-row-value-group">
        {resetBtn}
        <span className="sg-slider-val">{valueFormatter(value)}</span>
      </div>
      {track}
    </div>
  );
}
