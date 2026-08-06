/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Build-time CMS address. Required. */
  readonly STRAPI_URL: string;
  /** Optional read-only API token. */
  readonly STRAPI_TOKEN?: string;
  /** Public CMS address that reaches the browser. */
  readonly PUBLIC_STRAPI_URL?: string;
  /** GA4 id — production value comes from .env.production. */
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
