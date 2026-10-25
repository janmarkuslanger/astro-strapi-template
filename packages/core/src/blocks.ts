import type { BaseBlock } from "./types.js";

export type JsonLd = Record<string, unknown>;

/**
 * The block contract: everything the platform needs to know about one block
 * type, in one object. Platform code (adapter, renderer, llms.txt, JSON-LD)
 * iterates over registered definitions and never names a block type itself.
 *
 * `C` is the CMS side, owned by the adapter package (e.g. a Strapi mapping);
 * core never looks inside it. Every field except `jsonLd` is required, so a
 * half-registered block cannot compile.
 */
export interface BlockDefinition<B extends BaseBlock, C = unknown> {
  /** CMS side: read only by the adapter. */
  cms: C;
  /** Renders the block. Receives it as the `block` prop. */
  component: (props: { block: B }) => unknown;
  /** Facts for llms.txt. `[]` is a valid answer — but it must be a decision. */
  llms: (block: B) => string[];
  /** JSON-LD nodes derived from the block, e.g. FAQPage for an FAQ block. */
  jsonLd?: (block: B) => JsonLd[];
}

/**
 * One definition per member of the site's block union. Typing a registry with
 * this makes a missing block a compile error.
 */
export type BlockRegistry<B extends BaseBlock> = {
  [T in B["type"]]: BlockDefinition<Extract<B, { type: T }>, any>;
};

/** Definition for a block, or undefined for a type the registry does not know. */
export function definitionFor<B extends BaseBlock>(
  registry: BlockRegistry<any>,
  block: B
): BlockDefinition<B, unknown> | undefined {
  // The mapped type cannot be indexed by a generic B["type"]; the lookup is
  // sound because each key holds the definition for exactly that type.
  const byType = registry as Record<string, BlockDefinition<B, unknown> | undefined>;
  return byType[block.type];
}
