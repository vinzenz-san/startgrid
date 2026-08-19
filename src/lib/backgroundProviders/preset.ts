import { COLOR_PRESETS } from '../presets';
import { getAdaptiveColor } from '../colorUtils';
import { PresetConfig, BackgroundProviderDef } from '../../types/background';

export const presetProvider: BackgroundProviderDef<PresetConfig> = {
  mode: 'preset',
  label: 'Solid Color',
  panel: 'colors',
  resolveCss(config, ctx) {
    const preset = COLOR_PRESETS.find(p => p.id === config.value);
    if (!preset) return '#0f1117';
    if (!ctx.isDark && preset.lightOverride) return preset.lightOverride;
    return getAdaptiveColor({ color: preset.master, pickedInDark: true }, ctx.isDark);
  },
};
