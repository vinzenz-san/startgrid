// Small hand-drawn weather sprites (from "Weather particle sprites" by
// EMI EMI GAMES / E. Wouters — emiemigames.itch.io/weather-particle-sprites,
// free use permitted per the author's own comment on that page) — the same
// cheap "reuse a few small textures via GPU-blitted quads" technique behind
// HTC Sense's iconic weather animations, instead of trying to fake optics
// with procedural gradients. Copied into public/weather/ so they resolve
// as extension-relative paths at runtime, same as public/icons/.
const SPRITE_PATHS = {
  rainDark:   'weather/rain-dark.png',
  rainLight:  'weather/rain-light.png',
  rainSplash: 'weather/rain-splash.png', // 80x16 strip — 5 frames of 16x16
  snowflake:  'weather/snowflake.png',
} as const;

export type SpriteKey = keyof typeof SPRITE_PATHS;

export const RAIN_SPRITES: readonly SpriteKey[] = ['rainDark', 'rainLight'];

const cache = new Map<SpriteKey, HTMLImageElement>();

export function getSprite(key: SpriteKey): HTMLImageElement {
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.src = SPRITE_PATHS[key];
    cache.set(key, img);
  }
  return img;
}

/**
 * Resolves once every requested sprite has either loaded or failed — callers
 * don't need to block the animation loop on this, just kick it off before
 * seeding particles so the first frame isn't drawing half-loaded images.
 */
export function preloadSprites(keys: readonly SpriteKey[]): Promise<void> {
  return Promise.all(keys.map(key => {
    const img = getSprite(key);
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  })).then(() => undefined);
}
