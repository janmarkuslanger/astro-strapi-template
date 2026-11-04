import type { APIContext } from "astro";
import {
  buildLlmsTxt,
  HOME_SLUG,
  type BaseBlock,
  type BlockRegistry,
  type CmsRepository,
} from "@janmarkuslanger/powerhouse-core";

/**
 * Route logic shared by every site. A site's route file stays a typed
 * one-liner, so platform fixes arrive with a version bump; a site that needs
 * something else replaces its file — nothing here is required.
 *
 *   // src/pages/llms.txt.ts
 *   export const GET: APIRoute = llmsTxtRoute(cms, BLOCKS);
 */

type Route = (context: Pick<APIContext, "site">) => Promise<Response>;

const text = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

const siteUrlOf = (site: URL | undefined) => String(site ?? "").replace(/\/$/, "");

/**
 * `getStaticPaths` for `[...slug].astro`: every CMS page, the home page at
 * "/" (see HOME_SLUG). New pages need no code.
 */
export async function pagePaths<B extends BaseBlock, P extends object, G extends object>(
  cms: CmsRepository<B, P, G>
) {
  const pages = await cms.listPages();
  return pages.map((page) => ({
    params: { slug: page.slug === HOME_SLUG ? undefined : page.slug },
    props: { page },
  }));
}

/** `llms.txt`, generated from the CMS at build time, never hand-maintained. */
export function llmsTxtRoute<B extends BaseBlock, P extends object, G extends object>(
  cms: CmsRepository<B, P, G>,
  blocks: BlockRegistry<B>
): Route {
  return async ({ site }) => {
    const [global, pages] = await Promise.all([cms.getGlobal(), cms.listPages()]);
    return text(buildLlmsTxt(global, pages, siteUrlOf(site), blocks));
  };
}

export interface RobotsOptions {
  /**
   * AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are
   * allowed by default: the site wants to be found by generative engines
   * (see llms.txt). `false` disallows them.
   */
  aiCrawlers?: boolean;
}

const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

export function robotsTxt(siteUrl: string, { aiCrawlers = true }: RobotsOptions = {}): string {
  const rule = aiCrawlers ? "Allow: /" : "Disallow: /";
  return [
    "User-agent: *",
    "Allow: /",
    "",
    ...AI_CRAWLERS.flatMap((agent) => [`User-agent: ${agent}`, rule, ""]),
    `Sitemap: ${siteUrl}/sitemap-index.xml`,
    "",
  ].join("\n");
}

export function robotsTxtRoute(options: RobotsOptions = {}): Route {
  return async ({ site }) => text(robotsTxt(siteUrlOf(site), options));
}
