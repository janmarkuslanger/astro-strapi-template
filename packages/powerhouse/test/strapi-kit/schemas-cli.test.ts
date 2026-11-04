import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSchemas } from "../../src/strapi-kit/schemas-cli";
import { hash, SchemaError } from "../../src/strapi-kit/schemas";

let app: string;
const file = (rel: string) => path.join(app, rel);
const read = (rel: string) => fs.readFileSync(file(rel), "utf8");
const write = (rel: string, content: string) => {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), content);
};
const PAGE = "src/api/page/content-types/page/schema.json";

beforeEach(() => {
  app = fs.mkdtempSync(path.join(os.tmpdir(), "powerhouse-schemas-"));
  write("src/components/blocks/hero.json", JSON.stringify({ collectionName: "components_blocks_heroes", attributes: {} }));
});
afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

// Runs against the schemas this package ships, so a broken platform schema
// fails here.
describe("syncSchemas", () => {
  it("writes the platform schemas with site blocks and extensions, and is idempotent", () => {
    write("schema-extensions/page.json", JSON.stringify({ info: { displayName: "Seite" }, attributes: { hero: { type: "boolean" } } }));

    const first = syncSchemas(app);
    expect(first.written).toBeGreaterThan(0);
    const schema = JSON.parse(read(PAGE));
    expect(schema.info.displayName).toBe("Seite");
    expect(schema.attributes.hero).toEqual({ type: "boolean" });
    expect(schema.attributes.blocks.components).toEqual(["blocks.reference", "blocks.hero"]);
    expect(schema.pluginOptions["content-type-builder"].visible).toBe(false);
    expect(fs.existsSync(file("src/api/page/routes/page.ts"))).toBe(true);
    expect(read("src/components/blocks/hero.json")).toContain("heroes");

    expect(syncSchemas(app)).toEqual({ written: 0, removed: 0 });
  });

  it("refuses to run over a hand edit and leaves every file untouched", () => {
    syncSchemas(app);
    write(PAGE, read(PAGE).replace('"Page"', '"Edited"'));
    write("schema-extensions/page.json", JSON.stringify({ info: { displayName: "Seite" } }));

    expect(() => syncSchemas(app)).toThrow(SchemaError);
    expect(read(PAGE)).toContain('"Edited"');
  });

  it("removes a schema the platform no longer ships, with its empty directories", () => {
    syncSchemas(app);
    const manifest = JSON.parse(read("powerhouse-schemas.json"));
    write("src/api/old/routes/old.ts", "old\n");
    manifest.files["api/old/routes/old.ts"] = hash("old\n");
    write("powerhouse-schemas.json", JSON.stringify(manifest));

    expect(syncSchemas(app).removed).toBe(1);
    expect(fs.existsSync(file("src/api/old"))).toBe(false);
    expect(fs.existsSync(file("src/api/page"))).toBe(true);
  });

  it("reports an invalid extension file with its path", () => {
    write("schema-extensions/page.json", "{ nope");
    expect(() => syncSchemas(app)).toThrow(/schema-extensions\/page\.json/);
  });
});
