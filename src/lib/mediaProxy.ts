// Statically injected at build time via rspack.config.ts's DefinePlugin.
// Shared by useUnsplash.ts and providers/astronomy.ts so both consult the
// same flag instead of each re-deriving it from import.meta.env.
export const MEDIA_PROXY_URL = (import.meta.env.APP_MEDIA_PROXY_URL || '').replace(/\/$/, '');
export const MEDIA_PROXY_CONFIGURED = !!MEDIA_PROXY_URL;
