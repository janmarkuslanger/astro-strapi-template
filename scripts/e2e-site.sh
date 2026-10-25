#!/usr/bin/env bash
# End-to-end check of the customer path, from this repo's working tree:
#
#   template copy → init-site → packages as published (npm pack, no workspace
#   link) → npm test → Strapi build, seed, start → site build against it.
#
# Usage: scripts/e2e-site.sh [work-dir]   (default: a new temp dir, kept for inspection)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
SITE="$WORK/site"
TARBALLS="$WORK/tarballs"
PACKAGES=(core cms-strapi astro strapi-kit)
STRAPI_PID=""

cleanup() { [ -n "$STRAPI_PID" ] && kill "$STRAPI_PID" 2>/dev/null || true; }
trap cleanup EXIT

step() { echo "==> $*"; }

step "Packing platform packages"
mkdir -p "$TARBALLS"
(cd "$REPO" && npm run build:packages >/dev/null)
for pkg in "${PACKAGES[@]}"; do
  (cd "$REPO" && npm pack --workspace "packages/$pkg" --pack-destination "$TARBALLS" >/dev/null)
done

step "Copying the template (tracked and new files, as 'Use this template' would)"
mkdir -p "$SITE"
(cd "$REPO" && git ls-files -z --cached --others --exclude-standard) \
  | (cd "$REPO" && xargs -0 tar -cf -) | tar -xf - -C "$SITE"

step "init-site"
(cd "$SITE" && node scripts/init-site.mjs)

# The packages are not on npm yet (or not in this version): install the packed
# ones. Overrides also cover the dependencies between them.
step "Pointing the site at the packed packages"
(cd "$SITE" && node --input-type=module - "$TARBALLS" <<'NODE'
import fs from "node:fs";
const dir = process.argv[2];
const tarballs = Object.fromEntries(
  fs.readdirSync(dir).map((f) => {
    const name = `@janmarkuslanger/powerhouse-${f.replace(/^janmarkuslanger-powerhouse-/, "").replace(/-\d.*$/, "")}`;
    return [name, `file:${dir}/${f}`];
  })
);
const edit = (file, fn) => {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  fn(pkg);
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};
for (const file of ["apps/web/package.json", "apps/cms/package.json"]) {
  edit(file, (pkg) => {
    for (const name of Object.keys(pkg.dependencies)) if (tarballs[name]) pkg.dependencies[name] = tarballs[name];
  });
}
edit("package.json", (pkg) => (pkg.overrides = tarballs));
NODE
)

step "npm install"
(cd "$SITE" && rm -f package-lock.json && npm install --no-audit --no-fund >/dev/null)
for pkg in "${PACKAGES[@]}"; do
  if [ -L "$SITE/node_modules/@janmarkuslanger/powerhouse-$pkg" ]; then
    echo "powerhouse-$pkg is a symlink — the site uses local sources, not the package." >&2
    exit 1
  fi
done

step "npm test"
(cd "$SITE" && npm test)

step "Strapi: build, seed, start"
secret() { openssl rand -base64 16; }
sed -e "s|^APP_KEYS=.*|APP_KEYS=$(secret),$(secret)|" \
    -e "s|^API_TOKEN_SALT=.*|API_TOKEN_SALT=$(secret)|" \
    -e "s|^ADMIN_JWT_SECRET=.*|ADMIN_JWT_SECRET=$(secret)|" \
    -e "s|^TRANSFER_TOKEN_SALT=.*|TRANSFER_TOKEN_SALT=$(secret)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secret)|" \
    "$SITE/apps/cms/.env.example" > "$SITE/apps/cms/.env"
(cd "$SITE" && npm run build:cms >/dev/null)
(cd "$SITE/apps/cms" && NODE_ENV=production npx strapi start > "$WORK/strapi.log" 2>&1) &
STRAPI_PID=$!
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:1337/api/pages && break
  sleep 2
done
curl -sf -o /dev/null http://127.0.0.1:1337/api/pages || { cat "$WORK/strapi.log"; exit 1; }

step "Site build against the CMS"
(cd "$SITE" && STRAPI_URL=http://127.0.0.1:1337 npm run build:web >/dev/null)
for page in index.html about/index.html llms.txt; do
  [ -s "$SITE/apps/web/dist/$page" ] || { echo "missing: dist/$page" >&2; exit 1; }
done
grep -q "It works" "$SITE/apps/web/dist/index.html" || { echo "seeded content missing in index.html" >&2; exit 1; }

echo "OK: customer path works (work dir: $WORK)"
