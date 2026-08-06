import type { Page, SiteGlobal } from "./types";

/**
 * The contract every CMS adapter must fulfill. Pages and components only ever
 * talk to an object shaped like this — they never learn whether the data came
 * from Strapi, a JSON file, or anything else.
 *
 * To add a backend: implement this in `src/lib/cms/adapters/<name>.ts` and
 * register it in `client.ts`.
 *
 * Grow this interface as your content model grows. A blog, for example, adds
 * `listBlogPosts(query?)` and `getBlogPost(slug)` here, plus the matching
 * methods in the adapter. Keep query objects (rather than long parameter
 * lists) for anything a listing block can configure — that is what lets a
 * block carry a *selection* while the component fetches the data.
 */
export interface CmsRepository {
  getGlobal(): Promise<SiteGlobal>;
  listPages(): Promise<Page[]>;
  getPage(slug: string): Promise<Page | null>;
}
