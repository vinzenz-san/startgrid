import { CustomImageConfig, BackgroundProviderDef } from '../../types/background';

export const customProvider: BackgroundProviderDef<CustomImageConfig> = {
  mode: 'custom',
  label: 'Image / GIF',
  panel: 'image',
  resolveCss(_config, ctx) {
    if (!ctx.customImageUrl) return '#0f1117';
    // Size/position/repeat come from the shared display controls
    // (Background.tsx's layerStyle), same as every other image-backed
    // provider (bing.ts, astronomy.ts) — just the bare url() here.
    return `url("${ctx.customImageUrl}")`;
  },
};
