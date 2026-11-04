// Turns a copy of this template ("Use this template" on GitHub) into a
// customer site: removes the platform's own parts and points the site at the
// published packages and tagged workflows. Run once, in the new repository:
//
//   npm run init-site && npm install && git add -A && git commit -m "chore: init site"
//
// Until then npm would link the template's local package sources instead of
// the published ones, and the deploy workflows refuse to run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLATFORM_REPO = "janmarkuslanger/astro-strapi-template";

/** Platform-only paths. Everything else belongs to the site. */
export const PLATFORM_PATHS = [
  "packages/core",
  "packages/cms-strapi",
  "packages/astro",
  "packages/strapi-kit",
  ".github/workflows/release.yml",
  ".github/workflows/site-e2e.yml",
  ".github/workflows/deploy-cms.yml",
  ".github/workflows/deploy-web.yml",
  "scripts/set-version.mjs",
  "scripts/init-site.mjs",
  "scripts/e2e-site.sh",
  "scripts/test",
  "vitest.shared.ts",
];

/** Workflows that call the reusable ones and must reference them by tag. */
export const CALLER_WORKFLOWS = [".github/workflows/deploy.yml", ".github/workflows/content-rebuild.yml"];

/** Root vitest config of a site: only the site's own tests. */
export const SITE_VITEST_CONFIG = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: ["apps/web/vitest.config.ts"],
  },
});
`;

const BUILD_PACKAGES = "npm run build:packages && ";

/**
 * The platform version the site starts on: the version its web app already
 * depends on.
 * @param {{ dependencies?: Record<string, string> }} webPackageJson
 * @returns {string}
 */
export function platformVersion(webPackageJson) {
  const version = webPackageJson.dependencies?.["@janmarkuslanger/powerhouse-core"];
  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error(
      `apps/web/package.json must pin @janmarkuslanger/powerhouse-core to an exact version, got "${version}".`
    );
  }
  return version;
}

/**
 * Root package.json without the platform's scripts.
 * @template {{ scripts?: Record<string, string> }} T
 * @param {T} pkg
 * @returns {T & { scripts: Record<string, string> }}
 */
export function sitePackageJson(pkg) {
  /** @type {Record<string, string>} */
  const scripts = {};
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (name === "build:packages" || name === "init-site") continue;
    scripts[name] = command.replaceAll(BUILD_PACKAGES, "");
  }
  return { ...pkg, scripts };
}

/**
 * Points local `uses: ./.github/workflows/deploy-*.yml` at the tagged
 * platform workflows, and drops the comment that explains the local paths.
 * @param {string} yaml
 * @param {string} version
 */
export function tagWorkflowRefs(yaml, version) {
  return yaml
    .replace(
      /uses: \.\/\.github\/workflows\/(deploy-(?:cms|web)\.yml)/g,
      `uses: ${PLATFORM_REPO}/.github/workflows/$1@v${version}`
    )
    .replace(/^# \(this repo uses \.\/ paths because it is the platform repo itself\)\.\n/m, "");
}

/**
 * tsconfig.test.json without includes for platform paths. JSONC: comments
 * outside the JSON object are kept as they are.
 * @param {string} text
 */
export function siteTsconfigTest(text) {
  return text.replace(/"include": \[[^\]]*\]/, (match) => {
    /** @type {string[]} */
    const include = JSON.parse(`{${match}}`).include;
    const platform = (/** @type {string} */ entry) =>
      entry.startsWith("packages/") || entry.startsWith("scripts/") || entry === "vitest.shared.ts";
    const kept = include.filter((entry) => !platform(entry));
    return `"include": ${JSON.stringify(kept)}`;
  });
}

/**
 * Applies everything above to the site at `root`.
 * @param {string} root
 * @returns {{ version: string }}
 */
export function initSite(root) {
  const file = (/** @type {string} */ rel) => path.join(root, rel);
  if (!fs.existsSync(file("packages/core"))) {
    throw new Error("No platform package sources found — this site is already initialized.");
  }

  const version = platformVersion(JSON.parse(fs.readFileSync(file("apps/web/package.json"), "utf8")));

  const rootPkg = JSON.parse(fs.readFileSync(file("package.json"), "utf8"));
  fs.writeFileSync(file("package.json"), `${JSON.stringify(sitePackageJson(rootPkg), null, 2)}\n`);

  for (const workflow of CALLER_WORKFLOWS) {
    if (!fs.existsSync(file(workflow))) continue;
    fs.writeFileSync(file(workflow), tagWorkflowRefs(fs.readFileSync(file(workflow), "utf8"), version));
  }

  fs.writeFileSync(file("tsconfig.test.json"), siteTsconfigTest(fs.readFileSync(file("tsconfig.test.json"), "utf8")));
  fs.writeFileSync(file("vitest.config.mts"), SITE_VITEST_CONFIG);

  for (const rel of PLATFORM_PATHS) fs.rmSync(file(rel), { recursive: true, force: true });

  return { version };
}

/**
 * The repository's origin, or "" when there is none (e.g. a plain copy).
 * @param {string} root
 */
function originUrl(root) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // Running this in the platform would delete the packages it publishes.
  if (originUrl(root).replace(/\.git$/, "").endsWith(PLATFORM_REPO)) {
    console.error(`This is the platform repository (${PLATFORM_REPO}). init-site is for sites created from it.`);
    process.exit(1);
  }
  const { version } = initSite(root);
  console.log(`Site initialized on platform v${version}. Next: npm install, then commit everything.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
