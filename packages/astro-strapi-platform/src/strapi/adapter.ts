import type {
  BaseBlock,
  CmsRepository,
  Page,
  SiteGlobal,
} from "../core/index.js";
import {
  blockPopulate,
  mapBlocks,
  mapContext,
  mapGlobal,
  mapPage,
  type BlockResolver,
  type MapContext,
  type StrapiExtension,
  type StrapiBlockMapping,
  type StrapiBlockMappings,
  type StrapiBlockRegistry,
} from "./mapper.js";

interface BaseOptions<B extends BaseBlock> {
  /**
   * Where THIS process fetches from at build time. May be 127.0.0.1 when
   * building on the CMS host — never localhost (IPv6, see CLAUDE.md §4).
   */
  url: string;
  /** Optional read-only API token. */
  token?: string;
  /**
   * What ends up in the HTML — image sources, form endpoints — loaded later by
   * the VISITOR's browser, where 127.0.0.1 means their own machine. Defaults
   * to `url`, which is only right when that URL is public.
   */
  mediaUrl?: string;
  /** The site's block registry; the adapter reads each definition's `cms`. */
  blocks: StrapiBlockRegistry<B>;
}

/**
 * Required as soon as the site declares fields `X`, optional ones included —
 * a page type promising a field nobody maps would compile and then render
 * `undefined`.
 */
type ExtensionOption<K extends string, X extends object> = [keyof X] extends [never]
  ? { [key in K]?: StrapiExtension<X> }
  : { [key in K]: StrapiExtension<X> };

export type StrapiCmsAdapterOptions<
  B extends BaseBlock,
  P extends object = {},
  G extends object = {},
> = BaseOptions<B> & ExtensionOption<"page", P> & ExtensionOption<"global", G>;

export class StrapiCmsAdapter<
  B extends BaseBlock = BaseBlock,
  P extends object = {},
  G extends object = {},
> implements CmsRepository<B, P, G>
{
  private readonly url: string;
  private readonly token: string | undefined;
  private readonly mediaUrl: string;
  private readonly pageExtension: StrapiExtension<P> | undefined;
  private readonly globalExtension: StrapiExtension<G> | undefined;
  private readonly globalPopulate: string;
  /** Strapi side of every registered block, keyed by domain type. */
  private readonly blocks: StrapiBlockMappings;

  /** Cache so a page with five references costs one extra request, not five. */
  private sharedBlocks: Map<string, BaseBlock[]> | null = null;

  /**
   * Populate query so Strapi ships every component and media file of the
   * dynamic zone. Derived from the registered blocks; a block whose nested
   * fields arrive empty needs its own `populate` (see StrapiBlockMapping).
   */
  private readonly populate: string;

  /**
   * Pages additionally need their `seo` component. Strapi 5 populates no
   * component unless asked, so without this every page silently loses its
   * title and meta description.
   */
  private readonly pagePopulate: string;

  /**
   * `image` and `markdown` bound to the public media URL, for a site mapping
   * its own content types (see `get`).
   */
  readonly context: MapContext;

  constructor(options: StrapiCmsAdapterOptions<B, P, G>) {
    this.url = options.url;
    this.token = options.token;
    this.mediaUrl = options.mediaUrl || options.url;
    this.context = mapContext(this.mediaUrl);
    const extensions = options as {
      page?: StrapiExtension<P>;
      global?: StrapiExtension<G>;
    };
    this.pageExtension = extensions.page;
    this.globalExtension = extensions.global;
    // Every value of a StrapiBlockRegistry has a Strapi `cms`; TypeScript
    // cannot see through a mapped type over a generic union, so say it once.
    const definitions = Object.entries(options.blocks) as [
      string,
      { cms: StrapiBlockMapping<BaseBlock> },
    ][];
    this.blocks = Object.fromEntries(
      definitions.map(([type, definition]) => [type, definition.cms])
    );
    this.populate = blockPopulate(this.blocks);
    const extra = (extension?: StrapiExtension<object>) =>
      extension?.populate ? `&${extension.populate}` : "";
    this.pagePopulate = `populate[seo]=true&${this.populate}${extra(this.pageExtension)}`;
    this.globalPopulate = `populate[navigation]=true&populate[footerLinks]=true${extra(this.globalExtension)}`;
  }

  /**
   * Retries connection failures and gateway statuses with a short backoff.
   *
   * A build often starts right after the CMS restarts. A connect timeout or a
   * 502 in those first seconds is a blip, not an outage, and should not fail a
   * whole site build. Real errors (404, 401) fail on the first try — no wasted
   * backoff on a genuine mistake.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempt = 1
  ): Promise<Response> {
    const maxAttempts = 4;
    const retryable = (s: number) => s === 502 || s === 503 || s === 504;

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return this.fetchWithRetry(url, init, attempt + 1);
    }

    if (!res.ok && retryable(res.status) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return this.fetchWithRetry(url, init, attempt + 1);
    }
    return res;
  }

  /**
   * GET against the Strapi REST API, with the token and the retry above. For
   * a site's own content types: the site maps the response itself, using
   * `context` for media and Markdown.
   *
   *   const json = await strapi.get("/api/posts?populate[cover]=true");
   *   json.data.map((e) => ({ title: e.title, cover: strapi.context.image(e.cover) }));
   */
  async get(path: string): Promise<any> {
    return this.request(path);
  }

  /**
   * Every entry of a collection, page by page. Strapi answers a plain list
   * request with its first 25 entries only, so a site with more pages than
   * that would silently lose the rest.
   *
   * @param path collection path with its query, e.g. `/api/pages?populate[seo]=true`
   */
  async getAll(path: string): Promise<any[]> {
    const separator = path.includes("?") ? "&" : "?";
    const entries: any[] = [];
    for (let page = 1; ; page++) {
      const json = await this.request(
        `${path}${separator}pagination[page]=${page}&pagination[pageSize]=100`
      );
      entries.push(...(json.data ?? []));
      const pageCount = json.meta?.pagination?.pageCount ?? 1;
      if (page >= pageCount) return entries;
    }
  }

  /**
   * Populate query for a dynamic zone of a site's own content type that holds
   * the registered blocks (and references), e.g. a blog post's `blocks`.
   */
  populateBlocks(zone = "blocks"): string {
    return blockPopulate(this.blocks, zone);
  }

  /**
   * Maps a dynamic zone of a site's own content type with the registered
   * blocks, resolving references like on pages. Fetch it with
   * `populateBlocks(zone)`.
   */
  async mapBlocks(raw: any[] | null | undefined): Promise<B[]> {
    return mapBlocks(raw ?? [], this.mediaUrl, this.blocks, await this.blockResolver()) as B[];
  }

  private async request(path: string): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await this.fetchWithRetry(`${this.url}${path}`, { headers });
    if (!res.ok) {
      throw new Error(
        `Strapi request failed: ${res.status} ${res.statusText} (${path})`
      );
    }
    return res.json();
  }

  /**
   * Resolves `blocks.reference` into the blocks of the shared block it points
   * at. Done here so the domain model never sees a reference.
   *
   * Shared blocks may not contain references themselves, so there is nothing
   * to recurse into and cycles are impossible by construction — no runtime
   * cycle detection needed.
   */
  private async blockResolver(): Promise<BlockResolver> {
    if (!this.sharedBlocks) {
      const entries = await this.getAll(`/api/shared-blocks?${this.populate}`);
      this.sharedBlocks = new Map(
        entries.map((entry: any) => [
          String(entry.documentId ?? entry.id),
          mapBlocks(entry.blocks ?? [], this.mediaUrl, this.blocks),
        ])
      );
    }
    const cache = this.sharedBlocks;
    return (id: string) => cache.get(id) ?? [];
  }

  async getGlobal(): Promise<SiteGlobal<G>> {
    const json = await this.get(`/api/global?${this.globalPopulate}`);
    return mapGlobal(json.data ?? {}, this.mediaUrl, this.globalExtension);
  }

  // Mapped blocks are B by construction: only registered types survive the
  // mapper. The cast states that; it cannot be checked across the CMS boundary.
  async listPages(): Promise<Page<B, P>[]> {
    const entries = await this.getAll(`/api/pages?${this.pagePopulate}`);
    const resolve = await this.blockResolver();
    return entries.map(
      (e: any) =>
        mapPage(e, this.mediaUrl, this.blocks, resolve, this.pageExtension) as Page<B, P>
    );
  }

  async getPage(slug: string): Promise<Page<B, P> | null> {
    const json = await this.get(
      `/api/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&${this.pagePopulate}`
    );
    const entry = (json.data ?? [])[0];
    if (!entry) return null;
    return mapPage(
      entry,
      this.mediaUrl,
      this.blocks,
      await this.blockResolver(),
      this.pageExtension
    ) as Page<B, P>;
  }
}
