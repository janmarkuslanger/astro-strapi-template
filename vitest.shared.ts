import { fileURLToPath } from "node:url";

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

/** Tests run against package sources, never against a stale dist/. */
export const sourceAliases = {
  "@janmarkuslanger/powerhouse-core": src("core"),
  "@janmarkuslanger/powerhouse-cms-strapi": src("cms-strapi"),
};
