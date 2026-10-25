# Astro + Strapi Monorepo Template

A production-shaped starting point for content-driven websites: a static
**Astro** frontend, a **Strapi 5** CMS, and a repository layer between them so
the frontend never knows which CMS is behind it.

**Host it anywhere.** The frontend is a folder of static files and the CMS is a
Node process — nothing here assumes Vercel, a VPS, or any particular provider.

```
apps/web  ──▶  CmsRepository  ──▶  adapter  ──▶  apps/cms (Strapi)
   Astro          interface          Strapi         content types
   static      (domain model)       adapter        + dynamic zones
```

---

## Why this exists

Wiring Astro to Strapi is easy. Wiring it so that it keeps working — after a
second build machine appears, after an editor adds a field, after the CMS
restarts mid-build — is the part that takes projects a few painful months.

This template is the result of those months, extracted from a live site. The
code is ordinary; the value is in the decisions, and those are written down in
[`CLAUDE.md`](CLAUDE.md) with the reasoning intact — including what broke
without them.

It is written as guidance for [Claude Code](https://claude.com/claude-code) and
doubles as the onboarding document for humans. Read it before changing anything
structural.

---

## What's in the box

| Feature | What it buys you |
| --- | --- |
| **Repository pattern** | Pages call a `CmsRepository` interface, never Strapi. Swapping the CMS is one new adapter and one changed line. |
| **Compiler-enforced blocks** | Registering a block in only *some* of the required places fails the build instead of shipping a half-wired block. |
| **Reusable content blocks** | Maintain a CTA once, use it on twenty pages. References resolve inside the adapter, so the domain model never sees them — and cycles are impossible by construction. |
| **Seed once, never again** | Fixtures fill an empty CMS on first boot, then step aside permanently. No restart, deploy, or server swap can overwrite editorial work. |
| **Consent system** | Service-agnostic opt-in store; the banner builds itself from a registry. Two-click gate for embeds. Analytics is just the first consumer. |
| **SEO & GEO** | A generated `llms.txt` and a JSON-LD hook wired to the block model, so structured data is derived from content instead of maintained by hand. |
| **One build configuration** | Everything the browser sees comes from a single committed file, so every build machine produces a byte-identical site. |

### Deliberately not included

- **No content model.** Blog posts, categories, heroes, pricing tables, forms —
  every project models these differently, and a template that guesses wrong
  costs more than one that stays out of the way. You get `page`, `global`,
  reusable blocks, and exactly **one** example block (`rich-text`) so the
  registration mechanism is visible end to end. Delete it once you have real
  blocks.
- **No design.** The two Astro components are structurally correct and visually
  plain. Styling is the first thing every project replaces.
- **No auth, no e-commerce, no i18n.** Same reasoning.
- **No hosting lock-in.** See [`docs/deployment-targets.md`](docs/deployment-targets.md).

---

## Quick start

Requires **Node 22+** (see `.nvmrc`) and npm 10+.

```bash
# 1. Install
nvm use && npm install

# 2. Configure and start the CMS
cp apps/cms/.env.example apps/cms/.env
#    fill in the secrets: openssl rand -base64 16
npm run dev:cms          # → http://localhost:1337/admin

# 3. Start the frontend against it
cp apps/web/.env.example apps/web/.env
npm run dev:web          # → http://localhost:4321
```

On the first CMS start against an empty database, the fixtures are seeded and
public read permissions are granted. Create your admin account in the panel —
from that moment the CMS owns the content and the fixtures are never read again.

> **Use `127.0.0.1`, not `localhost`.** Node resolves `localhost` to IPv6 and
> Strapi listens on IPv4. The symptom is `ECONNREFUSED ::1:1337`.

### Making it yours

```bash
# Find every placeholder that needs renaming
grep -rl "@project/\|PROJECT\|example\.com" . --exclude-dir=node_modules
```

Then work through:

- [ ] Package names (`@project/*`) and the root `package.json` name
- [ ] The consent storage key in `apps/web/src/lib/consent.ts`
- [ ] `site` in `apps/web/astro.config.mjs` — canonicals and the sitemap need it
- [ ] `apps/web/.env.production` — the public CMS URL, and a GA id if you want
      analytics. **This file is committed on purpose**; see [`CLAUDE.md`](CLAUDE.md) §3
- [ ] The fixtures in `packages/shared-content/data/` — and your real content
      model, replacing the `rich-text` example block
- [ ] Fill in the project header in [`CLAUDE.md`](CLAUDE.md) §0
- [ ] Pick a deployment target and delete the shipping steps you don't use in
      `.github/workflows/deploy-web.yml`

---

## Repository layout

```
apps/
  web/                    Astro, static output
    .env.production       committed: public build config (CLAUDE.md §3)
    src/lib/cms/          client.ts (wiring) · types.ts (site domain types)
    src/lib/consent*.ts   service-agnostic consent store + registry
    src/blocks/           one folder per block + Block union and registry (index.ts)
    src/components/       ConsentBanner, ConsentGate, BlockRenderer
  cms/                    Strapi 5
    config/               server, database, middlewares, plugins
    src/index.ts          bootstrap: public permissions, seed, rebuild trigger
    src/seed.ts           runs once, into an empty database only
    src/rebuild.ts        publish → rebuild (hook | script | none)
    src/api/              content types
    src/components/       block + shared components
packages/                 platform packages, published to npm
  core/                   domain types, block contract, llms.txt, JSON-LD
  cms-strapi/             Strapi adapter, defineBlock
  shared-content/         fixtures in Strapi response format (site-owned)
docs/
  architecture.md         rules, layers, target package split, adding blocks
  deployment-targets.md   recipes per host
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:web` | Astro dev server |
| `npm run dev:cms` | Strapi dev server (admin + API) |
| `npm run build:web` | Production build → `apps/web/dist` |
| `npm run build:cms` | Strapi production build |
| `npm run preview:web` | Preview the production build locally |

---

## Adding a content block

A block is one self-contained definition. Full detail in
[`docs/architecture.md`](docs/architecture.md).

1. Create `apps/web/src/blocks/<name>/` with its type, `defineBlock({ cms, component, llms })`
   and the component.
2. Add the type to the `Block` union in `apps/web/src/blocks/index.ts`.
3. Register it in `BLOCKS` in the same file — *the build fails without this.*
4. Create the Strapi component and register it in the dynamic zones.

Nested fields deeper than one level need an explicit `cms.populate`, or they
arrive empty. If a new block looks half-filled, start there.

`apps/web/src/blocks/rich-text` is a worked example — read it once, then copy
the shape for your own.

---

## Deployment

The frontend is static and the CMS is a Node process, so the choice is yours.
[`docs/deployment-targets.md`](docs/deployment-targets.md) has concrete recipes
for a single VPS, Vercel/Netlify/Cloudflare Pages, and Strapi Cloud, plus the
three ways to trigger a rebuild when an editor publishes.

Four constraints hold regardless of host:

1. The CMS must be deployed and reachable **before** the frontend builds.
2. A publish must trigger a rebuild, or editors publish into the void.
3. Media URLs in the HTML must be publicly reachable — not `127.0.0.1`.
4. Every build path must produce the same site.

That last one is the subtle one. If a site can be built by more than one
machine, and the public configuration lives in two places, the two will drift
and the failure is silent: the page renders fine and has quietly lost its
analytics and consent banner. The template solves it with a single committed
`.env.production` that no build path may override — the full story, including
the measurement that proves an empty environment variable overrides a `.env`
file, is in [`CLAUDE.md`](CLAUDE.md) §3.

---

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `ECONNREFUSED ::1:1337` | Node resolves `localhost` to IPv6, Strapi listens on IPv4 → use `http://127.0.0.1:1337` |
| Images broken in production | `PUBLIC_STRAPI_URL` points at `127.0.0.1` — that address means *the visitor's* machine (CLAUDE.md §4) |
| No consent banner | No service registered. Without a GA id, `consent-services.ts` registers nothing and the banner renders nothing — intended locally |
| A block renders but is empty | Nesting deeper than one level needs `cms.populate` in the block's definition |
| `400 Invalid key blocks.…` | The frontend built before the CMS knew a component — the web job must wait for the CMS job |
| An editor can't see a new field | Strapi field-level permissions are per role and are not auto-granted. Settings → Roles in the panel, not in code |
| Deploy dies with `exit 137` | SIGKILL — out of memory on the server. Check `free -m` and `swapon --show` (CLAUDE.md §8) |

---

## Contributing

Issues and pull requests are welcome. Two things make a change easy to accept:

- **Keep the invariants.** If a change breaks one of the rules in `CLAUDE.md`,
  the rule may well deserve to change — say so in the PR and explain what
  replaces it.
- **Verify, don't assert.** Especially for deployment and shell changes. A run
  in a throwaway container beats reasoning about `flock` semantics, and saying
  "tested standalone, not end-to-end" is better than implying more coverage
  than you have.

All repository content — code, comments, commits, docs — is written in English.
Content *shown to a site's visitors* stays in that site's own language; the
distinction is spelled out in `CLAUDE.md` §0.

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, ship client work with it.
