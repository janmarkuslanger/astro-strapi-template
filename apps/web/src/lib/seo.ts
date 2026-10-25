import { definitionFor, type BlockRegistry } from "./blocks";
import type { Page, SiteGlobal } from "./cms/types";

/**
 * Structured data (JSON-LD).
 *
 * The pattern worth keeping: DERIVE schemas from the content blocks rather
 * than maintaining them by hand. A block definition's optional `jsonLd` turns
 * its block into nodes, so an editor who adds an FAQ block to a page gets
 * `FAQPage` markup with nobody touching code — and a new page is correct by
 * default instead of forgotten.
 */

type JsonLd = Record<string, unknown>;

export function organizationSchema(global: SiteGlobal, siteUrl: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: global.siteName,
    url: siteUrl,
    email: global.email,
    ...(global.claim ? { description: global.claim } : {}),
  };
}

export function pageSchemas(
  page: Page,
  global: SiteGlobal,
  siteUrl: string,
  blocks: BlockRegistry
): JsonLd[] {
  const schemas: JsonLd[] = [];

  // Only the homepage carries the organization node — repeating it on every
  // page adds noise without adding information.
  if (page.slug === "home") schemas.push(organizationSchema(global, siteUrl));

  // Derived from block type, never from page slug: a slug-based rule breaks
  // the moment an editor renames a page or reuses the block somewhere else.
  for (const block of page.blocks) {
    schemas.push(...(definitionFor(blocks, block)?.jsonLd?.(block) ?? []));
  }

  return schemas;
}
