import { marked } from "marked";
import type {
  BaseBlock,
  ImageAsset,
  Link,
  Page,
  Seo,
  SiteGlobal,
} from "@janmarkuslanger/site-core";

/** Resolves a shared-block id into its blocks. Supplied by the adapter. */
export type BlockResolver = (id: string) => BaseBlock[];

/**
 * Component id of the reference block. Adapter-internal: references are
 * resolved here and never reach the domain model.
 */
export const REFERENCE_COMPONENT = "blocks.reference";

/** Helpers a block's `map` gets, so no block re-implements URL or Markdown handling. */
export interface MapContext {
  image(raw: any): ImageAsset | undefined;
  markdown(value: unknown): string;
}

/** Strapi side of a block definition — the `cms` field of `defineBlock`. */
export interface StrapiBlockMapping<B extends BaseBlock> {
  /** Strapi component id, e.g. "blocks.hero". */
  component: string;
  /**
   * Populate fragment after `populate[blocks][on][<component>]`. Defaults to
   * `[populate]=*` (one level). Blocks with deeper nesting (items with images,
   * links in a list) must spell it out, or those fields arrive empty.
   */
  populate?: string;
  /** Strapi component → domain block, without `type` (added by the mapper). */
  map(raw: any, ctx: MapContext): Omit<B, "type">;
}

/** Strapi mappings keyed by domain block type. */
export type StrapiBlockMappings = Record<string, StrapiBlockMapping<any>>;

/** Populate query for a dynamic zone holding these blocks plus references. */
export function blockPopulate(mappings: StrapiBlockMappings): string {
  return [
    ...Object.values(mappings).map(
      (m) => `populate[blocks][on][${m.component}]${m.populate ?? "[populate]=*"}`
    ),
    `populate[blocks][on][${REFERENCE_COMPONENT}][populate]=block`,
  ].join("&");
}

/**
 * Media URLs arrive relative from Strapi ("/uploads/x.jpg"). They must become
 * absolute against the PUBLIC base, not the build-time base — the visitor's
 * browser loads them, not the build. See CLAUDE.md §4.
 *
 * Offered to every block's `map` as `ctx.image`, so no block can get this
 * wrong — it is the classic production-only bug.
 */
export function mapImage(raw: any, mediaUrl: string): ImageAsset | undefined {
  if (!raw) return undefined;
  const src: string = raw.url ?? "";
  return {
    src: src.startsWith("http") ? src : `${mediaUrl}${src}`,
    alt: raw.alternativeText ?? "",
    width: raw.width ?? undefined,
    height: raw.height ?? undefined,
  };
}

function mapLink(raw: any): Link | undefined {
  if (!raw?.href) return undefined;
  return { label: raw.label ?? "", href: raw.href };
}

/** Markdown → HTML once, at build time, so components never parse content. */
function md(value: unknown): string {
  return value ? (marked.parse(String(value), { async: false }) as string) : "";
}

function mapSeo(raw: any, fallbackTitle: string): Seo {
  return {
    title: raw?.title ?? fallbackTitle,
    description: raw?.description ?? "",
  };
}

/**
 * Turns Strapi's dynamic zone into domain blocks, using the registered
 * mappings.
 *
 * Unknown component ids are SKIPPED, not thrown on: a block added in the CMS
 * before the frontend knows it must never take the site down.
 */
export function mapBlocks(
  raw: any[],
  mediaUrl: string,
  mappings: StrapiBlockMappings,
  resolve?: BlockResolver
): BaseBlock[] {
  const ctx: MapContext = {
    image: (value) => mapImage(value, mediaUrl),
    markdown: md,
  };
  const byComponent = new Map(
    Object.entries(mappings).map(([type, m]) => [m.component, { type, m }])
  );
  const blocks: BaseBlock[] = [];

  for (const item of raw ?? []) {
    // Resolved here, never surfaced: the domain model has no reference type,
    // so pages cannot tell a shared block from an inline one.
    if (item.__component === REFERENCE_COMPONENT) {
      const id = item.block?.documentId ?? item.block?.id;
      if (id && resolve) blocks.push(...resolve(String(id)));
      continue;
    }

    const entry = byComponent.get(item.__component);
    if (!entry) continue;
    blocks.push({ ...entry.m.map(item, ctx), type: entry.type });
  }

  return blocks;
}

export function mapPage(
  entry: any,
  mediaUrl: string,
  mappings: StrapiBlockMappings,
  resolve?: BlockResolver
): Page {
  return {
    slug: entry.slug ?? "",
    title: entry.title ?? "",
    seo: mapSeo(entry.seo, entry.title ?? ""),
    blocks: mapBlocks(entry.blocks ?? [], mediaUrl, mappings, resolve),
  };
}

export function mapGlobal(entry: any): SiteGlobal {
  const links = (raw: any[]): Link[] =>
    (raw ?? []).map(mapLink).filter(Boolean) as Link[];

  return {
    siteName: entry.siteName ?? "",
    claim: entry.claim ?? undefined,
    email: entry.email ?? "",
    navigation: links(entry.navigation),
    footerLinks: links(entry.footerLinks),
  };
}
