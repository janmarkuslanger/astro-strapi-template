import type { Page, SiteGlobal } from "./cms/types";

/**
 * Structured data (JSON-LD).
 *
 * The pattern worth keeping: DERIVE schemas from the content blocks rather
 * than maintaining them by hand. Once `pageSchemas` inspects `page.blocks`,
 * an editor who adds an FAQ block to a page gets `FAQPage` markup with nobody
 * touching code — and a new page is correct by default instead of forgotten.
 *
 * The skeleton only ships the site-wide node, because block-derived schemas
 * depend on blocks this template deliberately does not define. See the comment
 * in `pageSchemas` for where yours go.
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
  siteUrl: string
): JsonLd[] {
  const schemas: JsonLd[] = [];

  // Only the homepage carries the organization node — repeating it on every
  // page adds noise without adding information.
  if (page.slug === "home") schemas.push(organizationSchema(global, siteUrl));

  // Add block-derived schemas here, e.g.:
  //
  //   const faqs = page.blocks.filter((b) => b.type === "faq");
  //   if (faqs.length) schemas.push({ "@type": "FAQPage", mainEntity: … });
  //
  // Filter by block type, never by page slug: a slug-based rule breaks the
  // moment an editor renames a page or reuses the block somewhere else.

  return schemas;
}
