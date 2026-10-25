import type { CmsRepository } from "../repository";
import type { Block, Page, SiteGlobal } from "../types";
import {
  blockPopulate,
  mapBlocks,
  mapGlobal,
  mapPage,
  type BlockResolver,
  type StrapiBlockMappings,
} from "./mapper";

export class StrapiCmsAdapter implements CmsRepository {
  /** Cache so a page with five references costs one extra request, not five. */
  private sharedBlocks: Map<string, Block[]> | null = null;

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

  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
    /** Public base for media/form URLs — see client.ts. */
    private readonly mediaUrl: string,
    /** Strapi side of every registered block, keyed by domain type. */
    private readonly blocks: StrapiBlockMappings
  ) {
    this.populate = blockPopulate(blocks);
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

  async listPages(): Promise<Page[]> {
    const json = await this.fetchJson(`/api/pages?${this.pagePopulate}`);
    const resolve = await this.blockResolver();
    return (json.data ?? []).map((e: any) => mapPage(e, this.mediaUrl, this.blocks, resolve));
  }

  async getPage(slug: string): Promise<Page | null> {
    const json = await this.fetchJson(
      `/api/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&${this.pagePopulate}`
    );
    const entry = (json.data ?? [])[0];
    if (!entry) return null;
    return mapPage(entry, this.mediaUrl, this.blocks, await this.blockResolver());
  }
}
