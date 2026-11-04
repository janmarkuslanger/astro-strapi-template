import type { StrapiBlockRegistry } from "@janmarkuslanger/powerhouse-cms-strapi";
import richText, { type RichTextBlock } from "./rich-text";

/** Every block this site renders. Add a member per block. */
export type Block = RichTextBlock;

/**
 * The single block registry: the adapter, the renderer, llms.txt and JSON-LD
 * all read from here.
 *
 * Typed as `StrapiBlockRegistry<Block>`, so a member of `Block` without an
 * entry — or an entry without a Strapi mapping — fails the build.
 * Adding a block: docs/architecture.md → "Adding a block".
 */
export const BLOCKS: StrapiBlockRegistry<Block> = {
  richText,
};
