# Architecture

## Principles

- **Frontend is CMS-agnostic.** Pages see domain types and one repository, nothing else.
- **Dependencies point one way.** Toward the domain model, never back.
- **Every CMS quirk ends in the adapter.**
- **Unknown blocks are skipped, never fatal.**
- **Forgetting a registration must fail the build**, not ship silently.
- **Derive, don't maintain.** SEO, JSON-LD and `llms.txt` come from the content model.

## Layers (current)

```
core ◀── cms-strapi, astro ◀── apps/web ──fetch──▶ apps/cms ──▶ strapi-kit
                                                          ▲
                                       packages/shared-content (fixtures)
```

| Layer | May import | Never imports |
| --- | --- | --- |
| pages, components | `cms` client, `lib/cms/types`, core helpers | adapter package |
| client, block modules | adapter package | — |
| adapter / astro package | core | site code |
| core | nothing | anything |

## Template scope

Ships the **mechanism**, not a content model.

| Shipped | Reason |
| --- | --- |
| `page` + dynamic zone | Block-composed pages are the architecture |
| `global` | Every site needs site-wide settings |
| `shared-block` + `reference` | Reuse pattern |
| `rich-text` | Single worked example; replace it |

Everything else (posts, heroes, forms, …) is per project.

---

## Platform packages

> One change in the platform reaches every site through a version bump, not a
> re-implementation per site. The platform is **one** npm package,
> `@janmarkuslanger/powerhouse`, with one entry point per role. This repo is
> the platform repo; `apps/` is the reference site and the starting point for
> new ones.

### Roles

| Role | Entry point (`@janmarkuslanger/powerhouse/…`) | Responsibility | Knows |
| --- | --- | --- | --- |
| core | `/core` | Domain types, block contract, repository interface, `llms.txt`, JSON-LD, page paths | nothing |
| cms-adapter | `/strapi` | Fetching, retry, reference resolution, media URLs, `defineBlock` | core |
| frontend-integration | `/astro`, `/astro/BlockRenderer.astro` | Block rendering, consent store + banner/gate behaviour, analytics, route logic | core |
| cms-plugin | `/strapi-kit` (CommonJS, for the Strapi server) | Platform schemas, CMS config, permissions, one-time seeding, rebuild trigger | — |
| deploy | `.github/workflows/deploy-*.yml` | Reusable CMS and site deploys | — |
| blocks | — *(not yet)* | Library of reusable blocks | core |
| site | `apps/*` | Config, design, copy, content, blocks, registry | all of the above |

```
core ◀── cms-adapter, frontend-integration ◀── site ──▶ cms-plugin, deploy
```

### Rules

1. **Packages never import from a site.** Site specifics enter only as config, props or the block registry.
2. **core knows no frontend framework and no CMS.**
3. **No design in packages.** Behaviour and unstyled mechanics only. Layout, styles and visible copy belong to the site.
4. **Packages never read `PUBLIC_*` env.** The site reads its committed `.env.production` and passes values in (CLAUDE.md §3).
5. **No per-site branches in packages.** No `if (site === …)`.
6. **Placement:** one site needs it → site. Two or more → package (option, prop or block).
7. **The block registry is the single source.** Adapter, renderer, `llms.txt` and JSON-LD all read it.

### Block contract

A block is **one self-contained unit**. Platform code iterates over the
registry and never names a block type.

| Field | Purpose |
| --- | --- |
| `cms` | CMS side: component id, `populate`, response → domain (`map`) |
| `component` | Rendering |
| `llms` | Contribution to `llms.txt` (required; `[]` is a valid answer) |
| `jsonLd` *(optional)* | JSON-LD contribution |

The registry is typed `StrapiBlockRegistry<Block>` (from the adapter package):
a missing entry, a missing required field or a missing Strapi mapping does not
compile. Platform functions take it as `BlockRegistry<Block>` and stay
CMS-agnostic.

### Distribution

- **One package, one version**: `scripts/set-version.mjs`, tag `vX.Y.Z`, `release.yml` publishes to npm.
- The layer rules above are enforced by `packages/powerhouse/test/layers.test.ts`, since no package boundary does it any more. Sources live in `packages/powerhouse/src/<role>/`.
- Prerelease tag (`vX.Y.Z-rc.1`) → npm dist-tag `next`; stable → `latest`.
- A failed release is rerun on the same tag; versions already on npm are skipped.
- Auth: trusted publishing (OIDC), no stored token. It can only be set up for a package that exists, so the very first version is published once by hand; steps in the header of `release.yml`.
- Sites pin that version in `package.json` **and** in `uses: …/deploy-*.yml@vX.Y.Z`. Updating a site = changing one number in both places.
- Roll out to a pilot site first, then to the rest. Automated update PRs (Renovate) cover both.
- Breaking change → migration note in the release; codemod when mechanical.

### Platform schemas

The platform's content types and components (`page`, `shared-block`, `global`,
`shared.seo`, `shared.link`, `blocks.reference`) ship in the package (`schemas/`)
and are **generated** into `apps/cms/src/` before every `strapi develop` and
`strapi build` (`npm run schemas -w apps/cms` runs it by hand).

- Generated files are committed, so a platform update shows its schema change as a diff.
- **Never edit them.** `apps/cms/powerhouse-schemas.json` records what was generated; a hand edit (also one made in the Content-Type Builder) stops the next run with the file name instead of being overwritten. Platform types are hidden in the Content-Type Builder for that reason.
- **Extend** in `apps/cms/schema-extensions/<name>.json`, `<name>` being the content type (`page`) or the component uid (`shared.seo`):

  ```json
  { "info": { "displayName": "Seite" }, "attributes": { "hero": { "type": "media", "multiple": false } } }
  ```

  Allowed: `info.displayName`, `info.description`, `info.icon`, new attributes. Refused: redefining a platform attribute, `singularName`/`pluralName` (they name the REST routes), anything else. Platform fields are fixed so that a platform update can never collide with a site change.
- **Dynamic zones** of `page` and `shared-block` list every component in `apps/cms/src/components/blocks/`. `shared-block` never offers `blocks.reference`: cycles stay impossible by construction.
- Generated by Strapi's own file loader, so UIDs stay `api::page.page` and no Strapi internals are involved. Rejected: a Strapi plugin — its content types get `plugin::` UIDs (data migration, new REST paths), and components could only be registered through internal API.
- `PLATFORM_PUBLIC_ACTIONS` and `PLATFORM_CONTENT_TYPES` (same package) cover the platform types in `apps/cms/src/index.ts`; a site adds its own types next to them.

### Routes and CMS config

Site files that stay one-liners, so their logic updates with the platform:

| Site file | Platform function |
| --- | --- |
| `apps/web/src/pages/llms.txt.ts` | `llmsTxtRoute(cms, BLOCKS)` |
| `apps/web/src/pages/robots.txt.ts` | `robotsTxtRoute({ aiCrawlers? })` |
| `apps/web/src/pages/[...slug].astro` | `getStaticPaths = () => pagePaths(cms)`; layout and markup stay the site's |
| `apps/cms/config/{admin,server,database,middlewares,plugins}.ts` | `adminConfig`, `serverConfig`, `databaseConfig`, `middlewaresConfig`, `pluginsConfig` |

A site that needs something else spreads the result and overrides
(`(params) => [...middlewaresConfig(params), "global::x"]`) or replaces the
file. The environment variable names in the config helpers are part of the
platform.

The home page convention lives in core: `HOME_SLUG`, `pageHref`, `slugOfHref`.

### Not in packages (yet)

- **Block library.** Blocks carry design; a shared library needs a split into shared mechanics + site component first (rule 3).

---

## Adding a block (current)

Step 3 is compiler-enforced. Steps 4 and 5 are not.

1. **Block module**: `apps/web/src/blocks/<name>/` with its domain type, `defineBlock` (from the adapter package) and the component. Requires `cms`, `component`, `llms`; `jsonLd` is optional.
2. **Domain type** into the `Block` union in `apps/web/src/blocks/index.ts`.
3. **Register** in `BLOCKS` in the same file. A union member without an entry fails the build.
4. **CMS component**: `apps/cms/src/components/blocks/<name>.json`. The dynamic zones of `page` and `shared-block` pick it up on the next `develop`/`build` (see *Platform schemas*).
5. **Test**: `apps/web/test/<name>.test.ts` — `cms.map`, `llms`, the component (template: `rich-text.test.ts`).

Nested relations or media deeper than one level need an explicit `cms.populate`, otherwise they arrive empty. Check this first when a block looks half-filled.

## Adding a content type

- Schema under `apps/cms/src/api/<name>/` (a site type; extending a platform type goes through `schema-extensions/`)
- In `apps/cms/src/index.ts`:
  - `PUBLIC_ACTIONS` (next to `PLATFORM_PUBLIC_ACTIONS`), **only if the frontend reads it**. Never visitor-created data.
  - `WATCHED` if changes should rebuild the site
  - a seed step, in dependency order
- If pages read it: a method on `CmsRepository` in `apps/web/src/lib/cms/types.ts`, implemented in `client.ts` with `strapi.get(path)` (token, retry) and `strapi.context` (`image` with the public media URL, `markdown`). The adapter package stays untouched.

## Extending a platform type

A new field on `page` or `global`, end to end:

1. **CMS**: `apps/cms/schema-extensions/page.json` → `{ "attributes": { "subtitle": { "type": "string" } } }` (see *Platform schemas*).
2. **Type**: `PageExtension = { subtitle?: string }` in `apps/web/src/lib/cms/types.ts`. From here on `client.ts` does not compile until step 3 is done.
3. **Mapping** in `client.ts`: `page: { map: (raw) => ({ subtitle: raw.subtitle ?? undefined }) }`. Media, components and relations also need `populate`, e.g. `"populate[hero]=true"`.
4. Pages read `page.subtitle`. Platform fields cannot be replaced: the adapter writes them after the site's.

`global` works the same with `GlobalExtension` and the `global` option.

## Mechanisms

**Shared blocks**
- The adapter fetches all shared blocks once and splices them into the page in place of each `reference`.
- The domain model has no `reference` type.
- Shared blocks cannot contain references, so cycles are impossible by construction.

**Listing blocks**
- The block stores only the selection (filters, limit). The component fetches through the repository at build time.
- Repository methods take a query object, which is what such a block configures.

**SEO / GEO**
- JSON-LD is derived from block types, not from slugs.
- `llms.txt` is generated from the domain model and cannot fall behind (`llms` is required per block).
