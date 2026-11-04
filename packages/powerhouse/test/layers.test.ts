import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The layer rules that separate packages used to enforce, now that the
 * platform ships as one (docs/architecture.md → Rules). An import outside a
 * layer's list fails here instead of quietly coupling two layers.
 */
const SRC = path.resolve(import.meta.dirname, "../src");

const ALLOWED: Record<string, (specifier: string) => boolean> = {
  // No framework, no CMS, no I/O.
  core: (s) => s.startsWith("./"),
  // Core plus Markdown; never Astro or Strapi's server.
  strapi: (s) => s.startsWith("./") || s.startsWith("../core/") || s === "marked",
  // Core through the public entry point: astro ships as source, and this keeps
  // one copy of core in a site.
  astro: (s) => s.startsWith("./") || s === "@janmarkuslanger/powerhouse/core" || s === "astro",
  // CommonJS on the Strapi server: no ESM layer may be imported from here.
  "strapi-kit": (s) => s.startsWith("./") || s.startsWith("node:") || s === "@strapi/strapi",
};

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|astro)$/.test(entry.name) ? [file] : [];
  });
}

const specifiers = (file: string) =>
  [...fs.readFileSync(file, "utf8").matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe("layer rules", () => {
  it("covers every layer in src/", () => {
    const layers = fs.readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(layers.sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it.each(Object.keys(ALLOWED))("%s imports only what its layer may", (layer) => {
    const violations = sources(path.join(SRC, layer)).flatMap((file) =>
      specifiers(file)
        .filter((s) => !ALLOWED[layer](s))
        .map((s) => `${path.relative(SRC, file)} imports ${s}`)
    );
    expect(violations).toEqual([]);
  });
});
