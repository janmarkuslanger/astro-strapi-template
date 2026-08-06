import type { CmsRepository } from "./repository";
import { StrapiCmsAdapter } from "./adapters/strapi";

/**
 * Single entry point for all content access:
 *
 *   import { cms } from "../lib/cms/client";
 *   const page = await cms.getPage("about");
 *
 * Pages and components import this and never the adapter. Swapping the backend
 * means writing one new adapter and changing the line below — no page changes.
 */
const url = import.meta.env.STRAPI_URL;
if (!url) {
  throw new Error(
    "STRAPI_URL is required. Start a local CMS (npm run dev:cms) and set " +
      "STRAPI_URL in apps/web/.env — use 127.0.0.1, not localhost (Node " +
      "resolves localhost to IPv6, Strapi listens on IPv4)."
  );
}

/**
 * Two different URLs on purpose (CLAUDE.md §4):
 *
 *   url               where THIS process fetches from at build time. May be
 *                     127.0.0.1 when building on the CMS host.
 *   PUBLIC_STRAPI_URL what ends up in the HTML — image sources and the form
 *                     endpoint, loaded later by the VISITOR's browser, where
 *                     127.0.0.1 would mean the visitor's own machine.
 *
 * Conflating them ships <img src="http://127.0.0.1:1337/uploads/…"> to
 * everyone. It looks fine locally and is broken for every real visitor.
 */
export const cms: CmsRepository = new StrapiCmsAdapter(
  url,
  import.meta.env.STRAPI_TOKEN,
  import.meta.env.PUBLIC_STRAPI_URL || url
);
