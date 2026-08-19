import { WikimediaConfig, BackgroundProviderDef } from '../../types/background';

// Dark space-themed fallback — same constant used by astronomy.ts — shown
// when the feed fetch fails or hasn't resolved yet.
const FALLBACK_CSS = 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)';

export const wikimediaProvider: BackgroundProviderDef<WikimediaConfig> = {
  mode: 'wikimedia',
  label: 'Wikimedia Image of the Day',
  panel: 'wikimedia',
  resolveCss(_config, ctx) {
    if (!ctx.wikimediaImageUrl) return FALLBACK_CSS;
    return `url("${ctx.wikimediaImageUrl}") center center / cover no-repeat`;
  },
};
