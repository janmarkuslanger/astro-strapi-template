import type { BaseBlock, BlockDefinition } from "@janmarkuslanger/powerhouse-core";
import type { StrapiBlockMapping } from "./mapper.js";

export { StrapiCmsAdapter, type StrapiCmsAdapterOptions } from "./adapter.js";
export type { MapContext, StrapiBlockMapping } from "./mapper.js";

/**
 * Declares a block whose CMS side is Strapi. Identity at runtime; exists so a
 * block module gets its types checked where it is written:
 *
 *   export default defineBlock<HeroBlock>({ cms: { component, map }, component, llms });
 */
export function defineBlock<B extends BaseBlock>(
  definition: BlockDefinition<B, StrapiBlockMapping<B>>
): BlockDefinition<B, StrapiBlockMapping<B>> {
  return definition;
}
