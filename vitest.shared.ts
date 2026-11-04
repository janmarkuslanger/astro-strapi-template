import { fileURLToPath } from "node:url";

const src = (entry: string) =>
  fileURLToPath(new URL(`./packages/powerhouse/src/${entry}/index.ts`, import.meta.url));

/** Tests run against package sources, never against a stale dist/. */
export const sourceAliases = {
  "@janmarkuslanger/powerhouse/core": src("core"),
  "@janmarkuslanger/powerhouse/strapi": src("strapi"),
};
