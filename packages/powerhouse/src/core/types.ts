/**
 * Domain model shared by every site. This is the ONLY shape pages and
 * components may depend on; whatever CMS sits behind it is translated into
 * these types by its adapter.
 *
 * Blocks are not defined here: the content model is where sites differ. A
 * site declares its own `Block` union and passes it in as `B`.
 */

export interface Seo {
  title: string;
  description: string;
}

export interface ImageAsset {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface Link {
  label: string;
  href: string;
}

/** Every block has a `type` discriminator; the rest is the block's own. */
export interface BaseBlock {
  type: string;
}

/** The fields every site's pages have; the platform owns them. */
export interface PageFields<B extends BaseBlock = BaseBlock> {
  slug: string;
  title: string;
  seo: Seo;
  blocks: B[];
}

/**
 * A page as a site sees it: the platform fields plus `X`, the fields the site
 * added to its page schema (`schema-extensions/page.json`). `X` cannot
 * replace a platform field — the adapter writes those last.
 */
export type Page<B extends BaseBlock = BaseBlock, X extends object = {}> = PageFields<B> & X;

/** The fields every site's global settings have; the platform owns them. */
export interface SiteGlobalFields {
  siteName: string;
  claim?: string;
  email: string;
  navigation: Link[];
  footerLinks: Link[];
}

/** Global settings plus the site's own fields, as for {@link Page}. */
export type SiteGlobal<X extends object = {}> = SiteGlobalFields & X;
