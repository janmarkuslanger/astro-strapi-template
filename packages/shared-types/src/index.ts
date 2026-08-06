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
 * decisions. Add the ones your project needs; the five steps are in
 * docs/architecture.md, and two of them are enforced by the compiler.
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

/** Add your project's blocks to this union. */
export type Block = RichTextBlock;

/**
 * The `__component` identifiers Strapi uses — the single source for the mapper
 * and the populate query.
 *
 * `satisfies Record<Block["type"], string>` is load-bearing: adding a block to
 * the union above without adding it here fails the build. That is deliberate —
 * a block registered in only one of two places is a silent bug, and silent bugs
 * in a content pipeline surface as "why is this section empty?" weeks later.
 *
 * Note `blocks.reference` is NOT here: references are resolved inside the
 * adapter and never reach the domain model.
 */
export const BLOCK_COMPONENTS = {
  richText: "blocks.rich-text",
} as const satisfies Record<Block["type"], string>;

export type BlockComponent =
  (typeof BLOCK_COMPONENTS)[keyof typeof BLOCK_COMPONENTS];

/** Component id of the reference block — adapter-internal, never in `Block`. */
export const REFERENCE_COMPONENT = "blocks.reference";

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
