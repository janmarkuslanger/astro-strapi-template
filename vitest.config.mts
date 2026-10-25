import { defineConfig } from "vitest/config";
import { sourceAliases } from "./vitest.shared";

// Plain TypeScript runs here; DOM tests opt in per file with
// `// @vitest-environment jsdom`. Tests that render .astro files need Astro's
// Vite config and live in their own projects.
export default defineConfig({
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        resolve: { alias: sourceAliases },
        test: {
          name: "platform",
          include: ["packages/*/test/**/*.test.ts", "scripts/test/**/*.test.ts"],
          exclude: ["packages/astro/test/components/**"],
        },
      },
      "packages/astro/vitest.config.ts",
      "apps/web/vitest.config.ts",
    ],
  },
});
