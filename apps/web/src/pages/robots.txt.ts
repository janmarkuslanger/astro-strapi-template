import type { APIRoute } from "astro";

/**
 * AI crawlers are allowed on purpose — the site wants to be found by
 * generative engines (see llms.txt). Flip these to Disallow if a project
 * decides otherwise.
 */
export const GET: APIRoute = ({ site }) => {
  const siteUrl = String(site ?? "").replace(/\/$/, "");
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    `Sitemap: ${siteUrl}/sitemap-index.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
