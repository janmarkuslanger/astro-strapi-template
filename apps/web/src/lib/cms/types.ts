/**
 * The domain model as this site sees it: platform types from powerhouse-core, with
 * `Page` bound to the site's own block union. Pages and components import
 * from here, never from an adapter.
 */
import type { Page as CorePage } from "@janmarkuslanger/powerhouse-core";
import type { Block } from "../../blocks";

export type {
  CmsRepository,
  ImageAsset,
  Link,
  Seo,
  SiteGlobal,
} from "@janmarkuslanger/powerhouse-core";
export type { Block } from "../../blocks";
export type Page = CorePage<Block>;
