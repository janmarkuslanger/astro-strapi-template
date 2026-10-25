# CLAUDE.md

Guidance for Claude Code working in this repository.

This is an Astro + Strapi monorepo. Most of what follows is not visible in the
code: it is the reasoning behind decisions that look arbitrary until you know
what went wrong without them. Read the invariants before changing anything
structural.

---

## 0. Project setup (fill this in per project)

<!-- Replace this block when starting a new project. -->

- **Project:** `<name>`
- **Frontend:** `<domain>` — Astro, static
- **CMS:** `<admin domain>` — Strapi 5
- **Deployment target:** `<vServer | Vercel | Netlify | Cloudflare | …>` (see
  [`docs/deployment-targets.md`](docs/deployment-targets.md))
- **Audience language:** `<e.g. German>` — see the language rule below.

### Language rule

**Everything committed to the repo is English**: code, comments, commit
messages, PR titles and descriptions, all documentation. Talking to the user in
another language is fine — this rule is about what ends up in git.

**Everything the audience sees stays in the audience's language**, and must
never be translated as a side effect of an unrelated change:

- Website copy: page content, article text, UI strings (buttons, form labels,
  error messages).
- Strapi: content-type and field display names (`schema.json` →
  `info.displayName`), admin UI text.
- Fixture content in `packages/shared-content`.

When a change touches both — e.g. a new Strapi field — the field *name*
(`slug`, `teaserText`) is English like the rest of the code, but its *label* in
the admin panel and any *content* it holds is in the audience's language.

---

## 1. Architecture invariants

These are load-bearing. Breaking one does not fail loudly; it rots quietly.

### The frontend does not know the CMS exists

Pages and components import **only** `cms` from `src/lib/cms/client.ts` and the
domain types from `packages/shared-types`. They never import an adapter, never
see a Strapi response shape, never handle `__component` or `populate`.

```ts
import { cms } from "../lib/cms/client";
const page = await cms.getPage("about");
```

Every CMS quirk ends in the adapter. Swapping the backend means writing one new
adapter and changing one line in `client.ts` — no page or component changes.
This is worth defending even when it feels like ceremony; it is what makes the
CMS replaceable and the frontend testable.

### The compiler enforces block registration

The template ships **one** example block (`rich-text`) and no content model —
blogs, heroes, pricing tables and forms differ per project, so they are yours
to add. What the template guarantees is that adding one cannot go half-done.

A block is **one self-contained definition** in `apps/web/src/blocks/<name>/`:
Strapi mapping, component, `llms.txt` contribution, optional JSON-LD. The
adapter, renderer, `llms.txt` and JSON-LD iterate over the registry and never
name a block type.

```ts
// apps/web/src/blocks/index.ts — typed so every Block["type"] needs an entry
export const BLOCKS: BlockRegistry = {
  richText,
  // …
};
```

A missing entry breaks the build, and so does a definition without `llms` —
often `[]`, but the decision has to be made rather than forgotten. Platform
code must not regain per-block `switch`es; that is what made blocks touch five
files.

The full checklist is in [`docs/architecture.md`](docs/architecture.md).

### Unknown blocks are ignored, never fatal

The mapper skips block types it does not recognize. A new component added in
Strapi before the frontend knows it must not break the site. Conversely: a
frontend deploy that runs *before* the CMS deploy fails with
`400 Invalid key blocks.…` — which is why the web job always waits for the CMS
job.

### Shared blocks resolve inside the adapter

The `reference` block (one block pointing at a reusable content block) is
resolved in the Strapi adapter: it fetches all shared blocks once and splices
their contents in. **The domain model has no `reference` type** — pages and
components only ever see ordinary blocks and never learn where one came from.
Shared blocks cannot themselves contain references, so cycles are impossible by
construction rather than by a runtime guard.

---

## 2. Content vs. structure — two separate worlds

**Structure** (content types, block components, schemas) lives in code under
`apps/cms/src/api/**` and `apps/cms/src/components/**`. Strapi applies schema
changes on boot, like a migration. This is the **only** path by which code
changes CMS state.

**Content** (pages, posts, text, images) comes from the fixtures in
`packages/shared-content` **exactly once**, into an empty database.
`seedContent` checks whether *any* content exists and does nothing if so.

There is deliberately **no** `SEED_CONTENT` flag or force switch. A restart, a
deploy, or a server swap must never be able to overwrite an afternoon of
editorial work. If you find yourself wanting a flag, you want a database reset
instead:

```bash
# local, SQLite
rm -rf apps/cms/.tmp && npm run dev:cms
```

After the first seed, **Strapi is the source of truth for content**. The
fixtures drift, and that is correct — they describe how a site *starts*, not
how it looks today. There is no sync back into the repo.

Never touched by seeding: the media library (files are matched by name and
reused, so re-seeding does not pile up duplicates) and form submissions.

---

## 3. Build configuration — the rule that cost the most to learn

> **Any value that reaches the browser must come from exactly one committed
> file, and no build path may pass it as an environment variable.**

### Why

A site is usually built by more than one machine. Typically: CI on a code
deploy, and — if the CMS can trigger rebuilds — the CMS host after a publish.
Both must produce byte-identical output.

The failure mode is nasty because it is silent. Put the GA measurement ID in CI
variables *and* in the CMS host's `.env`, and whichever machine builds last
wins. A rebuild after a publish then ships a site with no analytics and — since
the consent banner only renders when a service is registered — no cookie banner
either. Every page still renders correctly. Nothing errors. This is observed
behaviour, not a hypothetical: it ran unnoticed for hours.

### The trap underneath it

An **exported-but-empty** environment variable silently overrides a `.env`
file. Measured, not assumed:

```
PUBLIC_GA_MEASUREMENT_ID="" exported  → value is NOT in the build
variable not set at all               → value from .env.production is used
```

Both build paths did exactly this. `${{ vars.X }}` in GitHub Actions yields an
empty string when the variable is unset, and the rebuild script defaulted the
value to empty and exported it anyway. So simply adding a committed
`.env.production` would **not** have fixed it.

### The rule in practice

- `apps/web/.env.production` is **committed** and holds every value that ends
  up in the shipped HTML. Astro loads it for any production build, on any
  machine. `.gitignore` keeps `.env`, `.env.local` and `.env.*.local` ignored,
  so secrets still have nowhere to leak.
- Everything in that file is public by definition — it is served in the page
  source. **Never put a secret there.**
- **No build path sets `PUBLIC_*` variables.** Not CI, not the rebuild script.
- Build-time-only values (which CMS URL to *fetch* from) are different per path
  and stay as environment variables — they never reach the browser.
- Where a second build path exists, it **asserts** the critical value landed in
  the output and refuses to publish otherwise. Publishing nothing beats
  publishing a silently broken site.

### How to verify a change here

Build twice with the exact environment each path sets, then diff the output.
Anything other than "identical" is a bug:

```bash
diff -r dist-ci dist-server
```

---

## 4. Networking gotchas that cost hours

**Use `127.0.0.1`, never `localhost`.** Node resolves `localhost` to IPv6
(`::1`); Strapi listens on IPv4. The symptom is
`ECONNREFUSED ::1:1337` during build or dev.

**The build-time fetch URL is not the public media URL.** When the frontend is
built on the same host as the CMS, it fetches over `http://127.0.0.1:1337` —
but image `src` attributes and the contact-form endpoint go into the HTML and
are loaded *by the visitor's browser*, where `127.0.0.1` means the visitor's
own machine. The adapter therefore takes both:

```ts
new StrapiCmsAdapter(fetchUrl, token, publicMediaUrl)
```

Getting this wrong ships `<img src="http://127.0.0.1:1337/uploads/…">` to
everyone. It looks fine in a local check and is broken for every real visitor.

**Retry CMS fetches during the build.** If the build starts right after the CMS
restarts, a connect timeout or a 502/503 is a transient blip, not an outage.
Retry connection failures and gateway statuses with a short backoff; fail fast
on real errors like 404.

---

## 5. Strapi specifics worth knowing

**New fields are invisible to non-superadmin roles.** Strapi's field-level
permissions are per-role and do *not* auto-grant on new fields. After adding a
field, an editor will report "I can't see/edit that" — the fix is in the admin
panel under Settings → Roles, not in code. Budget for this every time you add a
field that editors need.

**Draft & publish changes which events matter.** Content types with draft &
publish should react to `publish`/`unpublish`/`delete` — reacting to every save
would rebuild the site for a draft nobody should see yet. Types *without* draft
& publish (site-wide settings, taxonomies) have no publish step, so a plain
update *is* the change.

**Form submissions are content, not just email.** When you add a form, store
every submission as its own content type **and** email it. Both best-effort:
the request should fail only if neither worked. A durable record in the panel
survives a broken SMTP config, and requests stay reviewable without inbox
access. Such a content type must have **no public REST route** and must stay
out of `setPublicPermissions` — it holds other people's personal data.

**One form type = one endpoint = one content type.** Do not add a "source" or
"type" discriminator field so two forms can share an endpoint — that field only
exists to paper over a shared endpoint that should have been split.

**Public read permissions are set in `bootstrap`**, not clicked in the panel, so
a fresh install works without manual steps.

---

## 6. Astro specifics

- **Static output.** No SSR, no Node runtime at the hosting target. This is
  what makes the deployment target interchangeable.
- **No client-side router.** Without Astro's `ViewTransitions`/`ClientRouter`,
  every navigation is a full page load, so GA4's automatic `page_view` works
  with no extra code. **If you add view transitions, you must fire `page_view`
  manually** on every virtual navigation — otherwise analytics silently reports
  only the landing page.
- **Pin `@astrojs/sitemap` to a version matching the Astro major.** v3.x for
  Astro 4; newer needs Astro 5.
- Directory-style URLs, so links have no `.html`.

---

## 7. Consent & analytics

The consent system is **service-agnostic**. Analytics is just the first
consumer:

- `lib/consent.ts` — generic store: one decision per service in `localStorage`,
  a change event, `onConsentChange(id, cb)` for consumers.
- `lib/consent-services.ts` — the **registry**. The banner renders itself from
  this list; an empty list renders nothing at all.
- `ConsentBanner.astro` — checkbox per service. "Accept all" and "Decline" carry
  equal visual weight (no dark patterns).
- `ConsentGate.astro` — two-click gate for embeds; slot content enters the DOM
  only after consent.

**Never paste a gtag.js snippet into the source.** It would load on page view,
before consent, defeating the whole system. The measurement ID is configuration
(§3), and the loader is created in code only after consent is granted.

Adding a service: register it, wire the consumer via `ConsentGate` or
`onConsentChange`, add a section to the privacy policy. Banner, storage, and
revocation adapt automatically.

---

## 8. Deployment is intentionally target-agnostic

The frontend is a folder of static files; the CMS is a Node process with a
database. Where they run is a deployment detail, not an architectural one.
Concrete recipes per target: [`docs/deployment-targets.md`](docs/deployment-targets.md).

Whatever the target, these hold:

1. **The CMS must be reachable and already deployed when the frontend builds.**
   The frontend is built against live CMS data. A frontend build racing ahead of
   a CMS schema change fails on unknown blocks.
2. **A publish must trigger a rebuild**, or editors will publish into the void
   and file a bug about it. How is target-specific (deploy hook, CI dispatch,
   local rebuild).
3. **Media URLs in the HTML must be publicly reachable** (§4).
4. **Both build paths must produce the same site** (§3).

### If you self-host on a small box, read this

A 1-core / 2 GB vServer running the CMS *and* building the site is tight enough
that ordinary operations kill each other. The lessons, in the order they were
learned:

- **`npm ci` deletes `node_modules` before rebuilding it.** If it is killed
  mid-flight, the tree has no `.bin` symlinks and *nothing* runs afterward —
  neither the CMS nor the site build (`astro: not found`). Skip the install
  entirely when the lockfile has not changed and the tree is intact; write a
  stamp file only *after* a successful install so an interrupted run never
  claims a healthy tree.
- **Two builders on one machine will collide.** A deploy and a publish-triggered
  rebuild must take the same lock.
- **Swap is not optional.** Without it the OOM killer ends the deploy with
  `exit code 137`, and `free -m` in the log is the fastest way to see why.
  Diagnose with numbers (`ps -eo pid,rss,etime --sort=-rss`), not guesses.

---

## 9. Working in this repo

- **Prefer editing existing files.** Do not introduce a new abstraction a task
  does not need.
- **Verify, don't assume.** Especially for shell scripts, deployment changes,
  and anything with two code paths. A quick run in a throwaway Debian container
  beats reasoning about `flock` semantics. Note that `flock` does **not** work
  over a macOS Docker bind mount — test on the container's own filesystem or
  you will get a false negative.
- **`bash -n` at minimum** before merging any deploy script change; extract and
  syntax-check remote scripts embedded in CI YAML too.
- **Report honestly.** If something was tested standalone rather than
  end-to-end, say so in the commit. A verification claim that quietly overstates
  coverage is worse than no claim.
- When a diagnosis is challenged, **re-derive it from evidence** instead of
  defending it. Timelines, `Last-Modified` headers, job timestamps, and process
  lists settle arguments that reasoning alone will not.
