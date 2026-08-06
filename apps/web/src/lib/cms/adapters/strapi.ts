import { BLOCK_COMPONENTS, REFERENCE_COMPONENT } from "../types";
import type { CmsRepository } from "../repository";
import type { Block, Page, SiteGlobal } from "../types";
import { mapBlocks, mapGlobal, mapPage, type BlockResolver } from "./mapper";

const B = BLOCK_COMPONENTS;

/**
 * Populate query so Strapi ships every component and media file of the dynamic
 * zone.
 *
 * Block ids come from shared-types — the single source. A block MISSING an
 * entry here still renders, but its nested fields (items, images, links)
 * arrive empty. There is no compiler check for this one, so when a new block
 * looks half-filled, start here. Step 4 of docs/architecture.md.
 */
const BLOCK_POPULATE = [
  `populate[blocks][on][${B.richText}][populate]=*`,
  `populate[blocks][on][${REFERENCE_COMPONENT}][populate]=block`,
].join("&");

export class StrapiCmsAdapter implements CmsRepository {
  /** Cache so a page with five references costs one extra request, not five. */
  private sharedBlocks: Map<string, Block[]> | null = null;

  constructor(
    private readonly url: string,
    private readonly token?: string,
    /** Public base for media/form URLs — see client.ts. Defaults to `url`. */
    private readonly mediaUrl: string = url
  ) {}

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
      const json = await this.fetchJson(`/api/shared-blocks?${BLOCK_POPULATE}`);
      this.sharedBlocks = new Map(
        (json.data ?? []).map((entry: any) => [
          String(entry.documentId ?? entry.id),
          mapBlocks(entry.blocks ?? [], this.mediaUrl),
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
    const json = await this.fetchJson(`/api/pages?${BLOCK_POPULATE}`);
    const resolve = await this.blockResolver();
    return (json.data ?? []).map((e: any) => mapPage(e, this.mediaUrl, resolve));
  }

  async getPage(slug: string): Promise<Page | null> {
    const json = await this.fetchJson(
      `/api/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&${BLOCK_POPULATE}`
    );
    const entry = (json.data ?? [])[0];
    if (!entry) return null;
    return mapPage(entry, this.mediaUrl, await this.blockResolver());
  }
}
