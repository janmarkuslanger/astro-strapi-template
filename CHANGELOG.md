# Changelog

`@janmarkuslanger/astro-strapi-platform` and the reusable workflows share one
version. A site updates both: the package in `apps/*/package.json`, the
workflows in `uses: …@vX.Y.Z`.

## 0.2.0

From moving the first existing site (yoga-by-julia) onto the platform.

- **strapi:** `listPages` and the shared-block lookup read every entry page by
  page — Strapi returns 25 by default, so larger sites lost pages. `getAll(path)`
  does the same for site content types.
- **strapi:** a block's `populate` may be a list (one fragment per nested field).
- **strapi:** `populateBlocks(zone)` and `mapBlocks(raw)` for a site content type
  with a dynamic zone of registered blocks; references resolve as on pages.
- **strapi:** a block's `map` may return `null` to leave the block out.
- **strapi:** an emptied SEO title falls back to the page title.
- **astro:** `CONSENT_STORAGE_KEY` is exported, so a site can carry its visitors'
  existing decisions over.
- **ci:** `deploy-cms-ssh.yml` reinstalls when the server rebuilds the site
  (`web-root`) and `astro` is missing.

No breaking change. Schemas unchanged.

## 0.1.1

- `prepack` builds the package, so it is never packed without `dist/`.
- First release through trusted publishing.

## 0.1.0

Broken: published without `dist/`. Use 0.1.1 or later.
