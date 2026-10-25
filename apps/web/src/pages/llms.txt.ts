import type { APIRoute } from "astro";
import { BLOCKS } from "../blocks";
import { cms } from "../lib/cms/client";
import { buildLlmsTxt } from "@janmarkuslanger/powerhouse-core";

/**
 * Generated from the CMS at build time, never hand-maintained — a text changed
 * in the panel is in here with the next build.
 */
export const GET: APIRoute = async ({ site }) => {
  const siteUrl = String(site ?? "").replace(/\/$/, "");
  const [global, pages] = await Promise.all([cms.getGlobal(), cms.listPages()]);

  return new Response(buildLlmsTxt(global, pages, siteUrl, BLOCKS), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
