# Architecture

```
              packages/shared-types        packages/shared-content
              (domain model, block ids)    (fixtures, Strapi response format)
                       │                            │
           ┌───────────┴────────────┐               ├──────────────┐
           ▼                        ▼               ▼              ▼
┌────────────────────────────────────────┐   ┌──────────────────────┐
│  apps/web — Astro, static              │   │  apps/cms — Strapi 5 │
│                                        │   │                      │
│  pages / components                    │──▶│  seeds once from     │
│      │ only CmsRepository + domain     │   │  shared-content      │
│      ▼                                 │   │                      │
│  src/lib/cms/                          │   │  REST API            │
│    repository.ts · client.ts           │◀──│  /api/*              │
│    adapters/{strapi,mapper}.ts         │   │                      │
└────────────────────────────────────────┘   └──────────────────────┘
```

## What the template defines, and what it leaves to you

The content model is where every project differs, so the template ships the
**mechanism** rather than a model:

| Shipped | Why it is structural |
| --- | --- |
| `page` with a dynamic zone | Pages composed of blocks *is* the architecture |
| `global` single type | Every site needs site-wide settings somewhere |
| `shared-block` + `blocks.reference` | A pattern, not a content decision |
| `blocks.rich-text` | One worked example so the five steps below are visible |

Everything else — blog posts, categories, heroes, pricing tables, FAQs, forms —
is a product decision. Add what your project needs; delete `rich-text` once you
have real blocks.

## Layers, and what may import what

| Layer | May import | Must never import |
| --- | --- | --- |
| `src/pages`, `src/components` | `cms` from `client.ts`, domain types | anything under `adapters/` |
| `client.ts` | one adapter | — |
| `adapters/*` | domain types, mapper | Astro components |
| `packages/shared-types` | nothing | everything (it is the root of the graph) |

The one-way dependency is the point: the domain model does not know Strapi
exists, so Strapi can be replaced without touching a single page.

## Adding a content block — the five steps

Two are compiler-enforced. The rest are easy to forget, hence the list.

1. **Domain type** — add the interface in `packages/shared-types` and add it to
   the `Block` union.
2. **Block id** — add the entry to `BLOCK_COMPONENTS`.
   *Compiler-enforced:* `satisfies Record<Block["type"], string>` fails the
   build on a missing entry.
3. **Strapi component** — `apps/cms/src/components/blocks/<name>.json`, then
   register it in the dynamic zone of `page/schema.json` (and `shared-block`,
   if it should be usable inside a reusable block).
4. **Adapter** — a `case` in `adapters/mapper.ts` and a populate entry in
   `adapters/strapi.ts`. **This is the step with no safety net:** without the
   populate entry the block renders, but its nested fields (items, images,
   links) arrive empty. If a new block looks half-filled, start here.
5. **Rendering + llms.txt** — an Astro component in `src/components/blocks/`,
   registered in `BlockRenderer`, and a `case` in `src/lib/llms.ts`.
   *Compiler-enforced* via a `never` branch: a new block must declare what it
   contributes to `llms.txt`, even if the answer is `[]`.

Consider whether the block should also contribute **structured data** — see
`src/lib/seo.ts`. Deriving JSON-LD from block types (rather than from page
slugs) is what makes new pages correct by default.

## Adding a content type

Beyond the block steps, a new content type needs:

- a schema under `apps/cms/src/api/<name>/content-types/<name>/`
- its read actions in `setPublicPermissions` (`apps/cms/src/index.ts`) — but
  only if the frontend actually reads it. Anything a visitor creates, such as
  form submissions, must stay off that list.
- an entry in `WATCHED` (`apps/cms/src/rebuild.ts`) if changes to it should
  rebuild the site
- an entry in `CONTENT_TYPES` (`apps/cms/src/seed.ts`) so it counts as "the
  site already has content"
- methods on `CmsRepository` and the adapter, if pages need to read it

## Reusable content blocks

A content type `shared-block` holds a name plus a dynamic zone. The
`blocks.reference` block points at one. The **Strapi adapter** resolves them:
it fetches every shared block once, then replaces each reference with that
block's contents.

Consequences worth knowing:

- The domain model has **no** `reference` type. Pages and components only ever
  see ordinary blocks and cannot tell a shared one from an inline one.
- Shared blocks cannot contain references themselves — the `shared-block`
  dynamic zone deliberately omits `blocks.reference` — so cycles are impossible
  by construction rather than by a runtime guard.

## Listing blocks fetch their own data

When you add a listing block (posts, products, events), give the block only the
*selection* — categories, a limit — and let the Astro component fetch through
the repository at build time. A new entry then appears without anyone editing
the page in the CMS.

That is why `CmsRepository` methods take a query object rather than a long
parameter list: the query object is what a listing block configures.

## SEO & GEO are derived, not maintained

- **JSON-LD** comes from the blocks (`src/lib/seo.ts`), so a page that gains an
  FAQ block gains `FAQPage` markup automatically.
- **`llms.txt`** ([llmstxt.org](https://llmstxt.org)) is generated from the
  domain model at build time. Because step 5 is compiler-enforced, it cannot
  silently fall behind the site.
