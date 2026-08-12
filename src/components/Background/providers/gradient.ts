import { ColorGradientConfig, BackgroundProviderDef } from '../../../types/background';

const DEFAULT_FROM = '#3498db';
const DEFAULT_TO = '#9b59b6';
const DEFAULT_ANGLE = 135;

// Linear/radial CSS generated from a from/to color pair (+ angle for linear).
// A "random gradient fetched from a third-party JSON endpoint" option is
// deliberately not implemented: resolveCss must stay a pure, synchronous
// function with no network side effects.
export function resolveGradientCss(config: ColorGradientConfig): string {
  const from = config.from ?? DEFAULT_FROM;
  const to = config.to ?? DEFAULT_TO;

  if (config.gradientType === 'radial') {
    return `radial-gradient(circle at center, ${from}, ${to})`;
  }

  const angle = config.angle ?? DEFAULT_ANGLE;
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

// mode stays 'colourGradient' — it's the discriminant persisted in
// browser.storage, so renaming the literal would orphan any already-saved
// config; only the user-facing label and TS identifiers are renamed to "Color".
export const colorGradientProvider: BackgroundProviderDef<ColorGradientConfig> = {
  mode: 'colourGradient',
  label: 'Color Gradient',
  panel: 'gradient',
  resolveCss: resolveGradientCss,
};
