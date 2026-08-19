import { getAdaptiveColor } from '../colorUtils';
import { ColorConfig, BackgroundProviderDef, BackgroundRenderCtx } from '../../types/background';

// customColor + customColorScheme is the single stored anchor; the
// counterpart for whichever theme is currently active is derived
// algorithmically (see getAdaptiveColor). Falls back to the raw `value`
// for configs saved before this scheme existed (a pre-baked hex or
// gradient CSS string from the old picker).
function resolveColorCss(config: ColorConfig, ctx: BackgroundRenderCtx): string {
  if (!config.customColor) return config.value;
  return getAdaptiveColor(
    { color: config.customColor, pickedInDark: config.customColorScheme !== 'light' },
    ctx.isDark,
  );
}

export const colorProvider: BackgroundProviderDef<ColorConfig> = {
  mode: 'color',
  label: 'Custom Color',
  panel: 'colors',
  resolveCss: resolveColorCss,
};

export const gradientProvider: BackgroundProviderDef<ColorConfig> = {
  mode: 'gradient',
  label: 'Gradient',
  panel: 'colors',
  resolveCss: resolveColorCss,
};
