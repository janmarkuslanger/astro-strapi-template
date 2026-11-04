import type { APIRoute } from "astro";
import { robotsTxtRoute } from "@janmarkuslanger/astro-strapi-platform/astro";

/**
 * AI crawlers are allowed on purpose — the site wants to be found by
 * generative engines (see llms.txt). `{ aiCrawlers: false }` if a project
 * decides otherwise.
 */
export const GET: APIRoute = robotsTxtRoute();
