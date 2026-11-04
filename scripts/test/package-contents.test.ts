import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

const PKG = path.resolve(import.meta.dirname, "../../packages/astro-strapi-platform");

// 0.1.0 went out without dist/: every compiled entry point was missing and
// the package was unusable. What npm would publish must contain every file
// the package's exports and typesVersions point at.
it("the packed package contains every export target", () => {
  const manifest = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: PKG, encoding: "utf8" }));
  const files = new Set<string>(manifest[0].files.map((f: { path: string }) => f.path));
  const pkg = JSON.parse(execFileSync("cat", ["package.json"], { cwd: PKG, encoding: "utf8" }));

  const targets = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") targets.add(value.replace(/^\.\//, ""));
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(pkg.exports);
  collect(pkg.typesVersions);

  expect(targets.size).toBeGreaterThan(5);
  expect([...targets].filter((target) => !files.has(target))).toEqual([]);
  expect(files.has("dist/strapi-kit/package.json")).toBe(true);
});
