import { StrapiCmsAdapter } from "@janmarkuslanger/astro-strapi-platform/strapi";
import { BLOCKS, type Block } from "../../blocks";
import type { CmsRepository, GlobalExtension, PageExtension } from "./types";

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
const strapi = new StrapiCmsAdapter<Block, PageExtension, GlobalExtension>({
  url,
  token: import.meta.env.STRAPI_TOKEN,
  mediaUrl: import.meta.env.PUBLIC_STRAPI_URL,
  blocks: BLOCKS,
  // Site fields on platform types (types.ts), e.g.:
  // page: { populate: "populate[hero]=true", map: (raw, ctx) => ({ hero: ctx.image(raw.hero) }) },
});

/**
 * The platform methods come from the adapter. A site content type adds its
 * method here, built on `strapi.get` (token, retry) and `strapi.context`
 * (public media URLs, Markdown):
 *
 *   async listPosts() {
 *     const json = await strapi.get("/api/posts?populate[cover]=true&sort=date:desc");
 *     return json.data.map((e: any) => ({ title: e.title, cover: strapi.context.image(e.cover) }));
 *   },
 */
export const cms: CmsRepository = {
  getGlobal: () => strapi.getGlobal(),
  listPages: () => strapi.listPages(),
  getPage: (slug) => strapi.getPage(slug),
};
