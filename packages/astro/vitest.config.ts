import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import { sourceAliases } from "../../vitest.shared";

// Component tests: Astro's Vite config compiles .astro files. Astro and Vite
// default to process.cwd(); without an explicit root the include matches
// nothing and the project silently runs zero tests.
const root = fileURLToPath(new URL(".", import.meta.url));

export default getViteConfig(
  {
    root,
    resolve: { alias: sourceAliases },
    test: { name: "astro-components", include: ["test/components/**/*.test.ts"] },
  },
  { root }
);
