import { definitionFor, type BlockRegistry } from "./blocks";
import type { Page, SiteGlobal } from "./cms/types";

/**
 * Builds `llms.txt` (llmstxt.org) — a compact site summary for generative
 * search engines. Generated from the domain model at build time, never
 * hand-maintained, so it cannot drift away from the site.
 *
 * What each block contributes is its definition's `llms` — a required field,
 * so a new block type fails the build until someone decides. Often the answer
 * is `[]`, but it has to be a decision rather than an oversight; that is what
 * keeps this file accurate as a project grows.
 */

function truncate(value: string, max = 300): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function buildLlmsTxt(
  global: SiteGlobal,
  pages: Page[],
  siteUrl: string,
  blocks: BlockRegistry
): string {
  const lines: string[] = [];

  lines.push(`# ${global.siteName}`);
  if (global.claim) lines.push(`\n> ${global.claim}`);
  lines.push(`\nContact: ${global.email}`);

  // Navigation order is the site's own idea of importance — reuse it instead
  // of inventing a ranking.
  const rank = (slug: string) => {
    const i = global.navigation.findIndex(
      (n) => n.href.replace(/^\/|\/$/g, "") === slug
    );
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = [...pages].sort((a, b) => rank(a.slug) - rank(b.slug));

  lines.push("\n## Pages\n");
  for (const page of ordered) {
    const href = page.slug === "home" ? "/" : `/${page.slug}/`;
    lines.push(`### ${page.title}`);
    lines.push(`${siteUrl}${href}`);
    if (page.seo.description) lines.push(page.seo.description);

    const facts = page.blocks.flatMap(
      (block) => definitionFor(blocks, block)?.llms(block) ?? []
    );
    for (const fact of facts.filter(Boolean)) {
      lines.push(`- ${truncate(fact)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
