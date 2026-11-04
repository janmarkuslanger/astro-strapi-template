# Deployment targets

The architecture is deliberately target-agnostic: **the frontend is a folder of
static files, the CMS is a Node process with a database.** Everything below is
a recipe for a specific host, not an architectural decision.

Whatever you pick, the four constraints from [`CLAUDE.md`](../CLAUDE.md) §8 hold:

1. The CMS must be deployed and reachable **before** the frontend builds.
2. A publish in the CMS must trigger a frontend rebuild.
3. Media URLs in the HTML must be publicly reachable — not `127.0.0.1`.
4. Every build path must produce the same site.

---

## Who owns what

Hosters differ per customer. The platform owns what holds on every hoster;
the site owns where things go.

| | Platform (reusable workflows, by tag) | Site (`deploy.yml`, `content-rebuild.yml`) |
| --- | --- | --- |
| Website | `build-web.yml`: build against the CMS, verify (public config present, no `127.0.0.1`), hand on the artifact `web-dist` | the `ship` job: put `web-dist` where it is served |
| CMS | `deploy-cms-ssh.yml` for any SSH server: change filter, runner build, upload, install only on a lockfile change, shared lock, health check | which recipe, and `restart-command` (`pm2 reload …`, `sudo systemctl restart …`, …) — or no job on a managed host |
| Order | `web` waits for `cms` and never runs after a failed CMS deploy | keep `needs: cms` unless the CMS job is gone |

`build-web.yml` stays the same everywhere; the `cms` and `ship` jobs are the
two places a site plugs in its hoster. Keep `deploy.yml` and
`content-rebuild.yml` in step: both ship.

### Ship recipes (the `ship` job)

**Any server over SSH** — what the template uses:

```yaml
  ship:
    needs: web
    uses: janmarkuslanger/astro-strapi-template/.github/workflows/ship-web-ssh.yml@vX.Y.Z
    with: { web-root: "${{ vars.WEB_ROOT }}", site-url: "${{ vars.SITE_URL }}" }
    secrets: { SSH_PRIVATE_KEY: …, SSH_KNOWN_HOSTS: …, SSH_USER: …, SSH_HOST: … }
```

**GitHub Pages:**

```yaml
  ship:
    needs: web
    runs-on: ubuntu-latest
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: "${{ steps.pages.outputs.page_url }}" }
    steps:
      - uses: actions/download-artifact@v4
        with: { name: web-dist, path: web-dist }
      - uses: actions/upload-pages-artifact@v3
        with: { path: web-dist }
      - id: pages
        uses: actions/deploy-pages@v4
```

**Object storage / CDN** (S3, R2, …): download `web-dist` as above, then the
provider's sync command, e.g. `aws s3 sync web-dist s3://<bucket> --delete`.

**Vercel / Netlify / Cloudflare Pages building by themselves:** no `ship`
job. `web` then only verifies; the host's build is a second build path and
must not set `PUBLIC_*` (Target B below). Alternatively deploy `web-dist`
with the host's CLI from a `ship` job, so there is only one build.

These recipes other than SSH are starting points, not tested in this repo.

### CMS recipes (the `cms` job)

- **Server over SSH:** `deploy-cms-ssh.yml` with the site's `restart-command`,
  e.g. `pm2 reload cms`, `sudo systemctl restart cms`,
  `docker compose up -d --build cms`. It runs in `app-dir` on the server.
- **Managed host building from the repo** (Strapi Cloud, Render, …): delete the
  `cms` job and `needs: cms`. The CMS's `prebuild` still generates the platform
  schemas there.

---

## Choosing a target

| | Frontend | CMS | Notes |
| --- | --- | --- | --- |
| **Single vServer** | nginx serves a folder | systemd or pm2 + Postgres | Cheapest, most control. Read the small-box warnings below. |
| **Vercel / Netlify / Cloudflare Pages** | platform build + CDN | still needs a host | Easiest frontend, but the CMS needs a home anyway. Check the licence terms for commercial use. |
| **Static host + managed CMS** | any object storage / CDN | Strapi Cloud | Least ops, highest running cost. |

The CMS is the part that constrains you: it needs a persistent process, a
database, and persistent file storage for uploads. The frontend runs anywhere.

---

## Common: the frontend build

Identical everywhere. What differs is only *where* it runs and *where the
output goes*.

```bash
npm ci
STRAPI_URL=https://<cms-domain> npm run build:web
# → apps/web/dist
```

`STRAPI_URL` is build-time only and never reaches the browser, so it may differ
per target. Everything the visitor sees comes from the committed
`apps/web/.env.production` — do **not** pass `PUBLIC_*` variables here
(CLAUDE.md §3).

---

## Target A — single vServer (nginx + systemd or pm2)

Both halves on one machine. The frontend is a folder; nginx serves it directly.

**Layout**

```
/var/www/<project>/
├── app/                 the repo (rsynced from CI)
├── shared/uploads/      media library, symlinked into apps/cms/public/uploads
└── web/
    ├── releases/<stamp>/
    └── current →        symlink, flipped atomically
```

**Why a symlink:** nginx follows it per request, so swapping releases is atomic
and no visitor ever sees a half-copied directory. Rollback is one command.

**Rebuild on publish:** the CMS builds the site itself on the same machine — no
CI round trip, no token. Hook into Strapi's content events, debounce a few
seconds, spawn a detached build script.

That script builds from the repo copy in `app/`, which only the CMS deploy job
updates. The path filter in `deploy-cms-ssh.yml` therefore runs that job for every push
except docs-only ones, frontend changes included. Narrow it and a frontend-only
push goes live, then gets reverted by the next publish, which rebuilds from the
old source with no error.

**Small-box warnings** (1 core / 2 GB — all learned the hard way):

- Set up **swap** before anything else. Without it `npm ci` gets OOM-killed
  (`exit code 137`) while the CMS is serving traffic.
- **Skip `npm ci` when the lockfile hasn't changed** and the tree is intact.
  It is the most expensive step and the only one that can leave the machine
  unable to run anything. Write a stamp file only after a *successful* install.
- **Lock** the deploy against the publish-triggered rebuild. Two builders on one
  machine will collide, and the loser leaves a broken `node_modules`.
- Build with `nice`/`ionice` so the admin panel stays responsive.

**Uploads must live outside the deploy directory** and be symlinked in, or
`rsync --delete` will wipe the media library on the next deploy.

---

## Target B — Vercel / Netlify / Cloudflare Pages

The frontend is a standard static build. The CMS still needs a host (Target A
or Strapi Cloud).

**Frontend settings**

| | |
| --- | --- |
| Build command | `npm run build:web` |
| Output directory | `apps/web/dist` |
| Install command | `npm ci` |
| Node version | from `.nvmrc` |
| Environment | `STRAPI_URL` (+ `STRAPI_TOKEN` if the API is not public) |

Do **not** add `PUBLIC_*` variables in the platform UI. That recreates the
two-sources-of-truth bug (CLAUDE.md §3) — the platform value would silently win
over the committed file, and the two build paths would diverge.

**Rebuild on publish:** create a deploy hook (a URL that triggers a build) and
call it from the CMS on publish. This replaces the local rebuild script; the
debounce logic in `packages/powerhouse/src/strapi-kit/rebuild.ts` still applies so ten publishes in
five minutes cost one build.

**Monorepo note:** point the project root at the repo root, not `apps/web` —
the build needs the workspace packages.

---

## Target C — static host + Strapi Cloud

Frontend to any object storage / CDN, CMS managed.

- Uploads are handled by the provider; the media URL is theirs. Make sure it
  ends up in `PUBLIC_STRAPI_URL` in `apps/web/.env.production`.
- Rebuild on publish via webhook → your CI's `workflow_dispatch` or the host's
  deploy hook.
- Everything else is unchanged: same build command, same output folder.

---

## Rebuild-on-publish: the three options

| Option | How | When it fits |
| --- | --- | --- |
| **Local rebuild** | CMS spawns the build on its own machine | CMS and frontend share a host |
| **Deploy hook** | CMS calls a platform URL on publish | Vercel/Netlify/Cloudflare |
| **CI dispatch** | CMS → `repository_dispatch` → CI workflow | Anything, but slowest and needs a token |

Whichever you pick, keep a **manual fallback** — a CI workflow an operator can
start by hand when the primary path is stuck. It costs one small file and saves
an evening.

Two things to get right in all three:

- **Debounce.** Publishing five pages in a row should cost one build, not five.
- **Never rebuild on form submissions.** A visitor sending a contact message
  must not trigger a site build.

---

## Health checks

Deploy scripts should verify rather than hope:

```bash
curl -s -o /dev/null -w "%{http_code}" https://<cms-domain>/api/global   # 200
curl -s -o /dev/null -w "%{http_code}" https://<site-domain>/            # 200
```

And before publishing a build, assert that the critical public values actually
landed in the output (CLAUDE.md §3) — a site that silently lost its consent
banner still returns 200.
