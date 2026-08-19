import { UnsplashConfig, BackgroundProviderDef } from '../../types/background';

export const unsplashProvider: BackgroundProviderDef<UnsplashConfig> = {
  mode: 'unsplash',
  label: 'Unsplash',
  panel: 'unsplash',
  resolveCss(_config, ctx) {
    if (!ctx.unsplashImageUrl) return '#0f1117';
    return `url("${ctx.unsplashImageUrl}") center/cover no-repeat`;
  },
};
