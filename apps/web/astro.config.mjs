import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// @astrojs/sitemap is pinned to exactly 3.6.0: 3.6.1+ break on Astro 4 (a
// caret range drifted into that). Bump both together.
export default defineConfig({
  site: "https://example.com", // ← set per project; used for canonicals + sitemap
  // Static output is what makes the deployment target interchangeable.
  output: "static",
  integrations: [tailwind({ applyBaseStyles: false }), sitemap()],
});
