import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

// Site tests: blocks and components, compiled with this site's Astro config.
// Packages resolve like in production (their dist/), so these tests run the
// same in the platform repo and in a customer site.
// Astro and Vite default to process.cwd(); without an explicit root the
// include matches nothing and the project silently runs zero tests.
const root = fileURLToPath(new URL(".", import.meta.url));

export default getViteConfig(
  {
    root,
    test: { name: "web", include: ["test/**/*.test.ts"] },
  },
  { root }
);
