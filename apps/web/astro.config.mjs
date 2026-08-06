import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// @astrojs/sitemap is pinned to the 3.x line on purpose: 4+ requires Astro 5.
// Bump both together or the build breaks in a confusing way.
export default defineConfig({
  site: "https://example.com", // ← set per project; used for canonicals + sitemap
  // Static output is what makes the deployment target interchangeable.
  output: "static",
  integrations: [tailwind({ applyBaseStyles: false }), sitemap()],
});
