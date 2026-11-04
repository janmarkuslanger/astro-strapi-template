import type { BaseBlock, Page, SiteGlobal } from "./types.js";

/**
 * The contract every CMS adapter must fulfill. Pages and components only ever
 * talk to an object shaped like this — they never learn whether the data came
 * from Strapi, a JSON file, or anything else.
 *
 * Keep query objects (rather than long parameter lists) for anything a
 * listing block can configure — that is what lets a block carry a *selection*
 * while the component fetches the data.
 */
export interface CmsRepository<B extends BaseBlock = BaseBlock> {
  getGlobal(): Promise<SiteGlobal>;
  listPages(): Promise<Page<B>[]>;
  getPage(slug: string): Promise<Page<B> | null>;
}
