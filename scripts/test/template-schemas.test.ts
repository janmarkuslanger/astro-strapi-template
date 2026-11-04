import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { syncSchemas } from "../../packages/strapi-kit/src/schemas-cli";

const CMS = path.resolve(import.meta.dirname, "../../apps/cms");

// The template's committed schemas are what a site starts from. A change to
// packages/strapi-kit/schemas without `npm run schemas -w apps/cms` fails here
// instead of in the first site build.
it("the template's CMS schemas are up to date with the platform's", () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "template-schemas-"));
  try {
    for (const rel of ["src", "schema-extensions", "powerhouse-schemas.json"]) {
      if (fs.existsSync(path.join(CMS, rel))) fs.cpSync(path.join(CMS, rel), path.join(app, rel), { recursive: true });
    }
    expect(syncSchemas(app)).toEqual({ written: 0, removed: 0 });
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});
