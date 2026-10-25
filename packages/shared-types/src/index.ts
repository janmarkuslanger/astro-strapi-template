/**
 * Domain model for the whole site. This is the ONLY shape the rest of the app
 * (pages, components) is allowed to depend on. Whatever CMS sits behind it must
 * be translated into these types by its adapter. Nothing outside
 * `src/lib/cms` may import from `adapters/*`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS A SKELETON. The content model is where every project differs, so
 * the template ships the *mechanism*, not a model:
 *
 *   Page          a page composed of blocks       — the architecture itself
 *   SiteGlobal    site-wide settings              — every site needs some
 *   RichTextBlock ONE example block               — delete or replace it
 *
 * Blog posts, categories, heroes, FAQs, pricing tables and so on are product
 * decisions. Add the ones your project needs: a type in the `Block` union here,
 * plus a block definition in apps/web/src/blocks (docs/architecture.md).
 * ─────────────────────────────────────────────────────────────────────────
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

/* ---------------------------------------------------------------- blocks */

/**
 * Example block — the smallest one that is still useful.
 *
 * Note `html` rather than `markdown`: the mapper renders Markdown to HTML once,
 * at build time, so components never do parsing work and never decide how
 * content is interpreted.
 */
export interface RichTextBlock {
  type: "richText";
  heading?: string;
  /** Pre-rendered HTML, produced by the mapper. */
  html: string;
}

/**
 * Add your project's blocks to this union. Each member needs a definition in
 * the block registry (apps/web/src/blocks) — the build fails without one.
 *
 * There is no `reference` member: references are resolved inside the adapter
 * and never reach the domain model.
 */
export type Block = RichTextBlock;

/* --------------------------------------------------------------- entities */

export interface Page {
  slug: string;
  title: string;
  seo: Seo;
  blocks: Block[];
}

export interface SiteGlobal {
  siteName: string;
  claim?: string;
  email: string;
  navigation: Link[];
  footerLinks: Link[];
}
