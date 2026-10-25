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
shared-types (domain)      shared-content (fixtures)
        │                          │
        ▼                          ▼
apps/web ── repository ──▶ adapter ──▶ apps/cms (REST)
```

| Layer | May import | Never imports |
| --- | --- | --- |
| pages, components | `cms` client, domain types | adapters |
| client | one adapter | — |
| adapters | domain types, mapper | UI components |
| domain types | nothing | anything |

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

## Target: platform packages

> **Status: target, not yet implemented.** Goal: one change in a package
> reaches every site through a version bump, not a re-implementation per site.

### Roles

| Package | Responsibility | Knows |
| --- | --- | --- |
| **core** | Domain types, block contract, repository interface, `llms.txt`, JSON-LD | nothing |
| **cms-adapter** | Fetching, retry, reference resolution, media URLs | core |
| **frontend-integration** | Routes, block rendering, consent, analytics, SEO head | core |
| **cms-plugin** | Base content types, permissions, seeding, rebuild trigger | core |
| **blocks** | Library of reusable blocks | core |
| **deploy** | Reusable CI workflows, server scripts | — |
| **site** | Config, design, content, site-only blocks | all of the above |

```
core ◀── cms-adapter, frontend-integration, cms-plugin, blocks ◀── site
```

### Rules

1. **Packages never import from a site.** Site specifics enter only as config or block lists.
2. **core knows no frontend framework and no CMS.**
3. **No design in packages.** Mechanics and overridable, unstyled components only. Layout, styles and visible copy belong to the site.
4. **Packages never read `PUBLIC_*` env.** The site reads its committed `.env.production` and passes values in (CLAUDE.md §3).
5. **No per-site branches in packages.** No `if (site === …)`.
6. **Placement:** one site needs it → site. Two or more → package (config option or block).
7. **The block list is the single registry.** Frontend and CMS receive the same list.

### Block contract

A block is **one self-contained unit**. Platform code iterates over registered
blocks and never names a specific block type.

| Field | Purpose |
| --- | --- |
| `type` | Domain discriminator |
| CMS schema + component id | Structure in the CMS |
| `map` | CMS response → domain block |
| `component` | Rendering |
| `llms` | Contribution to `llms.txt` (required; `[]` is a valid answer) |
| `schema` *(optional)* | JSON-LD contribution |

Every field is required by the type, so a half-registered block cannot compile.

### Distribution

- Packages live in their own repo, are versioned with semver, and are published privately.
- Sites pin versions. Automated update PRs per site.
- Roll out to a pilot site first, then to the rest.
- Breaking change → migration note or codemod.

### Open question

- Can a CMS plugin register block components from a package at runtime? If not, generate the schema files into the CMS app before its build (generated output, not committed).

### Migration order

1. deploy
2. cms-plugin (permissions, seed, rebuild)
3. Block contract, introduced inside the template first
4. core, cms-adapter, frontend-integration
5. Sites, one at a time

---

## Adding a block (current)

Steps 2 and 5 are compiler-enforced. Step 4 is not.

1. **Domain type**: interface in `shared-types`, added to the `Block` union.
2. **Block id**: entry in `BLOCK_COMPONENTS` (`satisfies` enforces it).
3. **CMS component**: `apps/cms/src/components/blocks/<name>.json`, added to the dynamic zones of `page` and, if reusable, `shared-block`.
4. **Adapter**: `case` in `mapper.ts` + populate entry in `strapi.ts`. Without populate, nested fields arrive empty. Check this first when a block looks half-filled.
5. **Rendering + `llms.txt`**: component in `components/blocks/`, `case` in `BlockRenderer`, `case` in `llms.ts` (a `never` branch enforces it).

Optional: JSON-LD in `seo.ts`.

## Adding a content type

- Schema under `apps/cms/src/api/<name>/`
- Read actions in `setPublicPermissions`, **only if the frontend reads it**. Never visitor-created data.
- `WATCHED` in `rebuild.ts` if changes should rebuild the site
- `CONTENT_TYPES` in `seed.ts`
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
- `llms.txt` is generated from the domain model and cannot fall behind (step 5).
