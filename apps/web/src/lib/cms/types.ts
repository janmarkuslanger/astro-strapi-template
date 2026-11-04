/**
 * The domain model as this site sees it: platform types from @janmarkuslanger/astro-strapi-platform/core,
 * bound to the site's own block union and its own page/global fields. Pages
 * and components import from here, never from an adapter.
 */
import type {
  CmsRepository as CoreRepository,
  Page as CorePage,
  SiteGlobal as CoreSiteGlobal,
} from "@janmarkuslanger/astro-strapi-platform/core";
import type { Block } from "../../blocks";

/**
 * Fields this site added to the platform's `page` and `global` schemas
 * (apps/cms/schema-extensions/). Declaring one here makes the compiler ask
 * for its mapping in client.ts.
 */
export type PageExtension = {};
export type GlobalExtension = {};

export type { ImageAsset, Link, Seo } from "@janmarkuslanger/astro-strapi-platform/core";
export type { Block } from "../../blocks";
export type Page = CorePage<Block, PageExtension>;
export type SiteGlobal = CoreSiteGlobal<GlobalExtension>;

/**
 * Everything pages can read. A site content type (posts, team members…) adds
 * its method here and its implementation in client.ts.
 */
export interface CmsRepository extends CoreRepository<Block, PageExtension, GlobalExtension> {}
