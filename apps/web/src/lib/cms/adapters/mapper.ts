import { marked } from "marked";
import { BLOCK_COMPONENTS, REFERENCE_COMPONENT } from "../types";
import type { Block, ImageAsset, Link, Page, Seo, SiteGlobal } from "../types";

/** Resolves a shared-block id into its blocks. Supplied by the adapter. */
export type BlockResolver = (id: string) => Block[];

const B = BLOCK_COMPONENTS;

/**
 * Media URLs arrive relative from Strapi ("/uploads/x.jpg"). They must become
 * absolute against the PUBLIC base, not the build-time base — the visitor's
 * browser loads them, not the build. See CLAUDE.md §4.
 *
 * Unused by the example block, but kept because the first image field you add
 * will need it, and getting this wrong is the classic production-only bug.
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
 * Turns Strapi's dynamic zone into domain blocks.
 *
 * Unknown component ids are SKIPPED, not thrown on: a block added in the CMS
 * before the frontend knows it must never take the site down. Add a `case` per
 * block — step 4 of docs/architecture.md.
 */
export function mapBlocks(
  raw: any[],
  mediaUrl: string,
  resolve?: BlockResolver
): Block[] {
  const blocks: Block[] = [];

  for (const item of raw ?? []) {
    switch (item.__component) {
      case B.richText:
        blocks.push({
          type: "richText",
          heading: item.heading ?? undefined,
          html: md(item.body),
        });
        break;

      // Resolved here, never surfaced: the domain model has no reference type,
      // so pages cannot tell a shared block from an inline one.
      case REFERENCE_COMPONENT: {
        const id = item.block?.documentId ?? item.block?.id;
        if (id && resolve) blocks.push(...resolve(String(id)));
        break;
      }

      default:
        break;
    }
  }

  return blocks;
}

export function mapPage(
  entry: any,
  mediaUrl: string,
  resolve?: BlockResolver
): Page {
  return {
    slug: entry.slug ?? "",
    title: entry.title ?? "",
    seo: mapSeo(entry.seo, entry.title ?? ""),
    blocks: mapBlocks(entry.blocks ?? [], mediaUrl, resolve),
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
