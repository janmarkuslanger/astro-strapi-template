import type { Block, Page, SiteGlobal } from "./cms/types";

/**
 * Builds `llms.txt` (llmstxt.org) — a compact site summary for generative
 * search engines. Generated from the domain model at build time, never
 * hand-maintained, so it cannot drift away from the site.
 *
 * The `never` branch below is load-bearing: a new block type fails the build
 * until someone decides what it contributes. Often the answer is `[]`, but it
 * has to be a decision rather than an oversight — that is the entire reason
 * this file stays accurate as a project grows.
 */

/** Facts a single block contributes. Empty array = contributes nothing. */
function factsFromBlock(block: Block): string[] {
  switch (block.type) {
    case "richText":
      return [stripHtml(block.html)];

    default: {
      // Compile error here = a new block type has no decision yet. Add a case,
      // even if it returns [].
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 300): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function buildLlmsTxt(
  global: SiteGlobal,
  pages: Page[],
  siteUrl: string
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

    for (const fact of page.blocks.flatMap(factsFromBlock).filter(Boolean)) {
      lines.push(`- ${truncate(fact)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
