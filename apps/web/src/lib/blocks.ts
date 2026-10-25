import type { Block } from "./cms/types";
import type { StrapiBlockMapping } from "./cms/adapters/mapper";

/**
 * The block contract: everything the platform needs to know about one block
 * type, in one object. Platform code (adapter, renderer, llms.txt, JSON-LD)
 * iterates over registered definitions and never names a block type itself.
 *
 * Every field except `jsonLd` is required, so a half-registered block cannot
 * compile. See docs/architecture.md → "Block contract".
 */
export interface BlockDefinition<B extends Block> {
  /** CMS side: component id, populate, response → domain. Read only by the adapter. */
  strapi: StrapiBlockMapping<B>;
  /** Renders the block. Receives it as the `block` prop. */
  component: (props: { block: B }) => unknown;
  /** Facts for llms.txt. `[]` is a valid answer — but it must be a decision. */
  llms: (block: B) => string[];
  /** JSON-LD nodes derived from the block, e.g. FAQPage for an FAQ block. */
  jsonLd?: (block: B) => Record<string, unknown>[];
}

/**
 * One definition per `Block["type"]`. Typing the registry with this makes a
 * missing block a compile error.
 */
export type BlockRegistry = {
  [T in Block["type"]]: BlockDefinition<Extract<Block, { type: T }>>;
};

/** Identity helper, so a block module gets its types checked where it is written. */
export function defineBlock<B extends Block>(
  definition: BlockDefinition<B>
): BlockDefinition<B> {
  return definition;
}

/** Definition for a block, or undefined for a type the registry does not know. */
export function definitionFor<B extends Block>(
  registry: BlockRegistry,
  block: B
): BlockDefinition<B> | undefined {
  // The mapped type cannot be indexed by a generic B["type"]; the lookup is
  // sound because each key holds the definition for exactly that type.
  const byType = registry as unknown as Record<string, BlockDefinition<B> | undefined>;
  return byType[block.type];
}
