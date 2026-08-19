import { AstronomyConfig, BackgroundProviderDef } from '../../types/background';

// Dark space-themed fallback — used when NASA's Picture of the Day is a
// video (media_type !== 'image') or the fetch fails outright.
const FALLBACK_CSS = 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)';

export const astronomyProvider: BackgroundProviderDef<AstronomyConfig> = {
  mode: 'astronomy',
  label: 'Astronomy Picture of the Day',
  panel: 'astronomy',
  resolveCss(_config, ctx) {
    if (!ctx.apodImageUrl) return FALLBACK_CSS;
    return `url("${ctx.apodImageUrl}") center center / cover no-repeat`;
  },
};
