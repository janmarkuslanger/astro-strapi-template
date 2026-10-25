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

export interface Page<B extends BaseBlock = BaseBlock> {
  slug: string;
  title: string;
  seo: Seo;
  blocks: B[];
}

export interface SiteGlobal {
  siteName: string;
  claim?: string;
  email: string;
  navigation: Link[];
  footerLinks: Link[];
}
