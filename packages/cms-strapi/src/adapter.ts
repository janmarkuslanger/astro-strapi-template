import type {
  BaseBlock,
  BlockRegistry,
  CmsRepository,
  Page,
  SiteGlobal,
} from "@janmarkuslanger/site-core";
import {
  blockPopulate,
  mapBlocks,
  mapGlobal,
  mapPage,
  type BlockResolver,
  type StrapiBlockMappings,
} from "./mapper.js";

export interface StrapiCmsAdapterOptions<B extends BaseBlock> {
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
  blocks: BlockRegistry<B>;
}

export class StrapiCmsAdapter<B extends BaseBlock = BaseBlock>
  implements CmsRepository<B>
{
  private readonly url: string;
  private readonly token: string | undefined;
  private readonly mediaUrl: string;
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

  constructor(options: StrapiCmsAdapterOptions<B>) {
    this.url = options.url;
    this.token = options.token;
    this.mediaUrl = options.mediaUrl || options.url;
    this.blocks = Object.fromEntries(
      Object.entries(options.blocks).map(([type, definition]) => [
        type,
        (definition as { cms: StrapiBlockMappings[string] }).cms,
      ])
    );
    this.populate = blockPopulate(this.blocks);
    this.pagePopulate = `populate[seo]=true&${this.populate}`;
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

  private async fetchJson(path: string): Promise<any> {
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
      const json = await this.fetchJson(`/api/shared-blocks?${this.populate}`);
      this.sharedBlocks = new Map(
        (json.data ?? []).map((entry: any) => [
          String(entry.documentId ?? entry.id),
          mapBlocks(entry.blocks ?? [], this.mediaUrl, this.blocks),
        ])
      );
    }
    const cache = this.sharedBlocks;
    return (id: string) => cache.get(id) ?? [];
  }

  async getGlobal(): Promise<SiteGlobal> {
    const json = await this.fetchJson(
      "/api/global?populate[navigation]=true&populate[footerLinks]=true"
    );
    return mapGlobal(json.data ?? {});
  }

  // Mapped blocks are B by construction: only registered types survive the
  // mapper. The cast states that; it cannot be checked across the CMS boundary.
  async listPages(): Promise<Page<B>[]> {
    const json = await this.fetchJson(`/api/pages?${this.pagePopulate}`);
    const resolve = await this.blockResolver();
    return (json.data ?? []).map(
      (e: any) => mapPage(e, this.mediaUrl, this.blocks, resolve) as Page<B>
    );
  }

  async getPage(slug: string): Promise<Page<B> | null> {
    const json = await this.fetchJson(
      `/api/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&${this.pagePopulate}`
    );
    const entry = (json.data ?? [])[0];
    if (!entry) return null;
    return mapPage(
      entry,
      this.mediaUrl,
      this.blocks,
      await this.blockResolver()
    ) as Page<B>;
  }
}
