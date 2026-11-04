import type { BaseBlock, Page, SiteGlobal } from "./types.js";

/**
 * The contract every CMS adapter must fulfill. Pages and components only ever
 * talk to an object shaped like this — they never learn whether the data came
 * from Strapi, a JSON file, or anything else.
 *
 * `P` and `G` are the site's own page and global fields (see `Page`). A site
 * that reads its own content types declares a repository extending this one.
 *
 * Keep query objects (rather than long parameter lists) for anything a
 * listing block can configure — that is what lets a block carry a *selection*
 * while the component fetches the data.
 */
export interface CmsRepository<
  B extends BaseBlock = BaseBlock,
  P extends object = {},
  G extends object = {},
> {
  getGlobal(): Promise<SiteGlobal<G>>;
  listPages(): Promise<Page<B, P>[]>;
  getPage(slug: string): Promise<Page<B, P> | null>;
}
