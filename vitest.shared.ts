import { fileURLToPath } from "node:url";

const src = (entry: string) =>
  fileURLToPath(new URL(`./packages/astro-strapi-platform/src/${entry}/index.ts`, import.meta.url));

/** Tests run against package sources, never against a stale dist/. */
export const sourceAliases = {
  "@janmarkuslanger/astro-strapi-platform/core": src("core"),
  "@janmarkuslanger/astro-strapi-platform/strapi": src("strapi"),
};
