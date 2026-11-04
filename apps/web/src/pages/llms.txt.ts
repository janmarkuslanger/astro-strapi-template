import type { APIRoute } from "astro";
import { llmsTxtRoute } from "@janmarkuslanger/powerhouse/astro";
import { BLOCKS } from "../blocks";
import { cms } from "../lib/cms/client";

/** Generated from the CMS at build time; the logic ships with the platform. */
export const GET: APIRoute = llmsTxtRoute(cms, BLOCKS);
