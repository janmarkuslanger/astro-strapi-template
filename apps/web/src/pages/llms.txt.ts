import type { APIRoute } from "astro";
import { llmsTxtRoute } from "@janmarkuslanger/astro-strapi-platform/astro";
import { BLOCKS } from "../blocks";
import { cms } from "../lib/cms/client";

/** Generated from the CMS at build time; the logic ships with the platform. */
export const GET: APIRoute = llmsTxtRoute(cms, BLOCKS);
