import { BackgroundConfig, BackgroundMode, BackgroundProviderDef, BackgroundRenderCtx } from '../../types/background';
import { presetProvider } from './preset';
import { colorProvider, gradientProvider } from './color';
import { customProvider } from './custom';
import { unsplashProvider } from './unsplash';
import { bingProvider } from './bing';
import { astronomyProvider } from './astronomy';
import { colorGradientProvider } from './gradient';
import { onlineImageProvider } from './online';
import { wikimediaProvider } from './wikimedia';

// Cast needed because each provider is typed to its specific config subtype,
// but the registry holds the union — resolveCss is called only when mode matches.
const BACKGROUND_PROVIDERS: Record<BackgroundMode, BackgroundProviderDef> = {
  preset:         presetProvider         as BackgroundProviderDef,
  color:          colorProvider          as BackgroundProviderDef,
  gradient:       gradientProvider       as BackgroundProviderDef,
  custom:         customProvider         as BackgroundProviderDef,
  unsplash:       unsplashProvider       as BackgroundProviderDef,
  bing:           bingProvider           as BackgroundProviderDef,
  astronomy:      astronomyProvider      as BackgroundProviderDef,
  colourGradient: colorGradientProvider as BackgroundProviderDef,
  online:         onlineImageProvider    as BackgroundProviderDef,
  wikimedia:      wikimediaProvider      as BackgroundProviderDef,
};

/** Resolves the current background's CSS via its mode's provider; falls back to a flat dark color if the mode has no registered provider. */
export function resolveBackgroundCss(config: BackgroundConfig, ctx: BackgroundRenderCtx): string {
  const provider = BACKGROUND_PROVIDERS[config.mode];
  return provider ? provider.resolveCss(config, ctx) : '#0f1117';
}

/** Human-readable label for a background mode, for use in settings UI. */
export function getProviderLabel(mode: BackgroundMode): string {
  return BACKGROUND_PROVIDERS[mode]?.label ?? mode;
}

export { BACKGROUND_PROVIDERS };
