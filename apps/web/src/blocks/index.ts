import type { BlockRegistry } from "../lib/blocks";
import richText from "./rich-text";

/**
 * Every block this site knows. The single registry: the adapter, the
 * renderer, llms.txt and JSON-LD all read from here.
 *
 * Typed as `BlockRegistry`, so a `Block["type"]` without an entry fails the
 * build. Adding a block: docs/architecture.md → "Adding a block".
 */
export const BLOCKS: BlockRegistry = {
  richText,
};
