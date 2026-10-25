import { StrapiCmsAdapter } from "@janmarkuslanger/cms-strapi";
import { BLOCKS, type Block } from "../../blocks";
import type { CmsRepository } from "./types";

/**
 * Single entry point for all content access:
 *
 *   import { cms } from "../lib/cms/client";
 *   const page = await cms.getPage("about");
 *
 * Pages and components import this and never the adapter. Swapping the backend
 * means another adapter package and changing the lines below — no page changes.
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
 * Two different URLs on purpose (CLAUDE.md §4): `url` is where the build
 * fetches from, `mediaUrl` is what ends up in the HTML. Conflating them ships
 * <img src="http://127.0.0.1:1337/uploads/…"> to every real visitor.
 */
export const cms: CmsRepository<Block> = new StrapiCmsAdapter<Block>({
  url,
  token: import.meta.env.STRAPI_TOKEN,
  mediaUrl: import.meta.env.PUBLIC_STRAPI_URL,
  blocks: BLOCKS,
});
