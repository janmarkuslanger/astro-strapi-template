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
site-core ◀── cms-strapi, astro ◀── apps/web ──fetch──▶ apps/cms ──▶ strapi-kit
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

> One change in a package reaches every site through a version bump, not a
> re-implementation per site. This repo is the platform repo; `apps/` is the
> reference site and the starting point for new ones.

### Roles

| Role | Package | Responsibility | Knows |
| --- | --- | --- | --- |
| core | `site-core` | Domain types, block contract, repository interface, `llms.txt`, JSON-LD | nothing |
| cms-adapter | `cms-strapi` | Fetching, retry, reference resolution, media URLs, `defineBlock` | core |
| frontend-integration | `astro` | Block rendering, consent store + banner/gate behaviour, analytics | core |
| cms-plugin | `strapi-kit` | Permissions, one-time seeding, rebuild trigger | — |
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

The registry is typed over the site's `Block` union: a missing entry or a
missing required field does not compile.

### Distribution

- All packages share **one version** (lockstep): `scripts/set-version.mjs`, tag `vX.Y.Z`, `release.yml` publishes to npm.
- Sites pin that version in `package.json` **and** in `uses: …/deploy-*.yml@vX.Y.Z`. Updating a site = changing one number in both places.
- Roll out to a pilot site first, then to the rest. Automated update PRs (Renovate) cover both.
- Breaking change → migration note in the release; codemod when mechanical.

### Not in packages (yet)

- **CMS schemas** (content types, block components) live in the site's CMS app. A package cannot ship them without either a runtime registration (unverified for Strapi 5) or a generate-before-build step.
- **Routes** (`[...slug]`, `llms.txt`, `robots.txt`) are thin site files calling package functions.
- **Block library.** Blocks carry design; a shared library needs a split into shared mechanics + site component first (rule 3).

---

## Adding a block (current)

Step 3 is compiler-enforced. Step 4 is not.

1. **Block module**: `apps/web/src/blocks/<name>/` with its domain type, `defineBlock` (from the adapter package) and the component. Requires `cms`, `component`, `llms`; `jsonLd` is optional.
2. **Domain type** into the `Block` union in `apps/web/src/blocks/index.ts`.
3. **Register** in `BLOCKS` in the same file. A union member without an entry fails the build.
4. **CMS component**: `apps/cms/src/components/blocks/<name>.json`, added to the dynamic zones of `page` and, if reusable, `shared-block`.

Nested relations or media deeper than one level need an explicit `cms.populate`, otherwise they arrive empty. Check this first when a block looks half-filled.

## Adding a content type

- Schema under `apps/cms/src/api/<name>/`
- In `apps/cms/src/index.ts`:
  - `PUBLIC_ACTIONS`, **only if the frontend reads it**. Never visitor-created data.
  - `WATCHED` if changes should rebuild the site
  - a seed step, in dependency order
- Repository method + adapter implementation if pages read it

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
