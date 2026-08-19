import { BingConfig, BackgroundProviderDef } from '../../types/background';
import { fetchBingImageDirect, BingImageResult } from '../bingApi';

export type { BingImageResult };

// bing.npanuhin.me sends `access-control-allow-origin: *`, so a direct fetch
// from the extension page (newtab.html) works without any background-script
// relay — see the comment in lib/bingApi.ts.
export const fetchBingImage = fetchBingImageDirect;

export const bingProvider: BackgroundProviderDef<BingConfig> = {
  mode: 'bing',
  label: 'Bing Daily Wallpaper',
  panel: 'bing',
  resolveCss(_config, ctx) {
    if (!ctx.bingImageUrl) return '#0f1117';
    return `url("${ctx.bingImageUrl}") center/cover no-repeat`;
  },
};
