// Rspack has no Vite-style import.meta.env of its own — rspack.config.ts's
// DefinePlugin statically injects exactly these three APP_-prefixed keys
// (see the 'import.meta.env.APP_*' entries there). This just types what's
// already injected at build time; it doesn't add or change any runtime value.
interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly APP_MEDIA_PROXY_URL: string;
  readonly APP_NASA_API_KEY: string;
  readonly APP_CARTO_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
