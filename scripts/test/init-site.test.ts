import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLATFORM_PATHS,
  PLATFORM_REPO,
  SITE_VITEST_CONFIG,
  initSite,
  platformVersion,
  sitePackageJson,
  siteTsconfigTest,
  tagWorkflowRefs,
} from "../init-site.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

describe("platformVersion", () => {
  it("reads the exact core version the web app pins", () => {
    expect(platformVersion({ dependencies: { "@janmarkuslanger/powerhouse-core": "0.2.0" } })).toBe("0.2.0");
    expect(platformVersion({ dependencies: { "@janmarkuslanger/powerhouse-core": "1.0.0-rc.1" } })).toBe("1.0.0-rc.1");
  });

  it.each([undefined, "^0.2.0", "*", "file:../core"])("rejects %s", (version) => {
    const dependencies: Record<string, string> = version ? { "@janmarkuslanger/powerhouse-core": version } : {};
    const pkg = { dependencies };
    expect(() => platformVersion(pkg)).toThrow("exact version");
  });
});

describe("sitePackageJson", () => {
  const pkg = {
    name: "acme",
    scripts: {
      "build:packages": "npm run build -w packages/core",
      "build:web": "npm run build:packages && npm run build --workspace apps/web",
      test: "npm run build:packages && tsc -p tsconfig.test.json && vitest run",
      "init-site": "node scripts/init-site.mjs",
      "preview:web": "npm run preview --workspace apps/web",
    },
  };

  it("drops platform scripts and the package build from every other script", () => {
    expect(sitePackageJson(pkg).scripts).toEqual({
      "build:web": "npm run build --workspace apps/web",
      test: "tsc -p tsconfig.test.json && vitest run",
      "preview:web": "npm run preview --workspace apps/web",
    });
  });

  it("keeps everything else", () => {
    expect(sitePackageJson(pkg).name).toBe("acme");
  });
});

describe("tagWorkflowRefs", () => {
  it("points local reusable workflows at the tagged platform", () => {
    const yaml = "    uses: ./.github/workflows/deploy-cms.yml\n    uses: ./.github/workflows/deploy-web.yml\n";
    expect(tagWorkflowRefs(yaml, "0.2.0")).toBe(
      `    uses: ${PLATFORM_REPO}/.github/workflows/deploy-cms.yml@v0.2.0\n` +
        `    uses: ${PLATFORM_REPO}/.github/workflows/deploy-web.yml@v0.2.0\n`
    );
  });

  it("drops the comment about local paths and leaves other lines alone", () => {
    const yaml = "# keep\n# (this repo uses ./ paths because it is the platform repo itself).\n      - uses: actions/checkout@v4\n";
    expect(tagWorkflowRefs(yaml, "0.2.0")).toBe("# keep\n      - uses: actions/checkout@v4\n");
  });
});

describe("siteTsconfigTest", () => {
  it("removes platform includes and keeps comments and options", () => {
    const text = '// note\n{\n  "compilerOptions": { "noEmit": true },\n  "include": ["a.d.ts", "packages/*/test", "apps/web/test", "scripts/test", "vitest.shared.ts"]\n}\n';
    const out = siteTsconfigTest(text);
    expect(out.startsWith("// note\n")).toBe(true);
    expect(out).toContain('"compilerOptions": { "noEmit": true }');
    expect(out).toContain('"include": ["a.d.ts","apps/web/test"]');
  });
});

describe("initSite", () => {
  let site: string;

  // A copy of the real template files the script touches, so the test breaks
  // when the template changes in a way the script does not handle.
  beforeEach(() => {
    site = fs.mkdtempSync(path.join(os.tmpdir(), "init-site-"));
    const copy = (rel: string) =>
      fs.cpSync(path.join(REPO_ROOT, rel), path.join(site, rel), {
        recursive: true,
        filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}dist`),
      });
    for (const rel of [
      "package.json",
      "tsconfig.test.json",
      "vitest.config.mts",
      "vitest.shared.ts",
      "apps/web/package.json",
      "packages/shared-content",
      ".github/workflows",
      "scripts",
      "packages/core",
      "packages/cms-strapi",
      "packages/astro",
      "packages/strapi-kit",
    ]) {
      copy(rel);
    }
  });

  afterEach(() => fs.rmSync(site, { recursive: true, force: true }));

  const read = (rel: string) => fs.readFileSync(path.join(site, rel), "utf8");
  const exists = (rel: string) => fs.existsSync(path.join(site, rel));
  const templateVersion = () => platformVersion(JSON.parse(read("apps/web/package.json")));

  it("removes every platform path and keeps the site's own", () => {
    initSite(site);
    expect(PLATFORM_PATHS.filter(exists)).toEqual([]);
    expect(exists("packages/shared-content/data/pages.json")).toBe(true);
    expect(exists(".github/workflows/ci.yml")).toBe(true);
  });

  it("leaves no reference to local reusable workflows", () => {
    const version = templateVersion();
    initSite(site);
    for (const workflow of [".github/workflows/deploy.yml", ".github/workflows/content-rebuild.yml"]) {
      const yaml = read(workflow);
      expect(yaml).not.toMatch(/uses: \.\//);
      expect(yaml).toContain(`/deploy-web.yml@v${version}`);
    }
  });

  it("leaves no workflow that runs a removed script", () => {
    initSite(site);
    const dir = path.join(site, ".github/workflows");
    for (const workflow of fs.readdirSync(dir)) {
      for (const [ref] of fs.readFileSync(path.join(dir, workflow), "utf8").matchAll(/scripts\/[\w./-]+/g)) {
        expect(exists(ref), `${workflow} runs ${ref}`).toBe(true);
      }
    }
  });

  it("leaves no script that needs the package sources", () => {
    initSite(site);
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(Object.values(scripts).join("\n")).not.toMatch(/build:packages|packages\/|init-site/);
    expect(scripts["build:web"]).toBeDefined();
    expect(scripts.test).toBeDefined();
  });

  it("limits the test setup to the site", () => {
    initSite(site);
    expect(read("vitest.config.mts")).toBe(SITE_VITEST_CONFIG);
    expect(read("tsconfig.test.json")).not.toMatch(/packages\/|scripts\/|vitest\.shared/);
  });

  it("returns the platform version the site starts on", () => {
    expect(initSite(site)).toEqual({ version: templateVersion() });
  });

  it("refuses to run twice", () => {
    initSite(site);
    expect(() => initSite(site)).toThrow("already initialized");
  });
});
