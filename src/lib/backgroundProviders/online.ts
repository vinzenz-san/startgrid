import { OnlineImageConfig, BackgroundProviderDef } from '../../types/background';

export const onlineImageProvider: BackgroundProviderDef<OnlineImageConfig> = {
  mode: 'online',
  label: 'Online Image',
  panel: 'online',
  resolveCss(config, _ctx) {
    if (!config.value) return '#0f1117';
    // Size/position/repeat come from the shared display controls
    // (Background.tsx's layerStyle), same as every other image-backed
    // provider — just the bare url() here. Displaying a cross-origin image
    // via CSS background-image never needs a permission or a fetch relay
    // (that's only a concern for a script-initiated fetch/XHR).
    return `url("${config.value}")`;
  },
};
