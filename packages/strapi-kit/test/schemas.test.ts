import { describe, expect, it } from "vitest";
import { buildSchemas, extensionName, hash, planSync, SchemaError } from "../src/schemas";

const page = {
  kind: "collectionType",
  info: { singularName: "page", pluralName: "pages", displayName: "Page" },
  attributes: {
    title: { type: "string" },
    blocks: { type: "dynamiczone", components: ["blocks.reference"] },
  },
};
const shared = {
  kind: "collectionType",
  info: { singularName: "shared-block", pluralName: "shared-blocks", displayName: "Reusable block" },
  attributes: { blocks: { type: "dynamiczone", components: [] } },
};
const seo = { info: { displayName: "SEO" }, attributes: { title: { type: "string" } } };

const platform = {
  "api/page/content-types/page/schema.json": JSON.stringify(page),
  "api/page/routes/page.ts": "router\n",
  "api/shared-block/content-types/shared-block/schema.json": JSON.stringify(shared),
  "components/shared/seo.json": JSON.stringify(seo),
  "components/blocks/reference.json": JSON.stringify({ info: {}, attributes: {} }),
};

const build = (siteBlocks: string[] = [], extensions: Record<string, unknown> = {}) =>
  buildSchemas({ platform, siteBlocks, extensions });
const parsed = (files: Record<string, string>, path: string) => JSON.parse(files[path]);
const problems = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SchemaError) return error.problems;
    throw error;
  }
  throw new Error("expected a SchemaError");
};

describe("extensionName", () => {
  it("names content types by singular name and components by uid", () => {
    expect(extensionName("api/page/content-types/page/schema.json")).toBe("page");
    expect(extensionName("components/shared/seo.json")).toBe("shared.seo");
    expect(extensionName("api/page/routes/page.ts")).toBeNull();
  });
});

describe("buildSchemas", () => {
  it("copies non-schema files verbatim", () => {
    expect(build()["api/page/routes/page.ts"]).toBe("router\n");
  });

  it("adds every site block to the platform's dynamic zones, sorted, after the platform's own", () => {
    const files = build(["teaser", "hero"]);
    expect(parsed(files, "api/page/content-types/page/schema.json").attributes.blocks.components).toEqual([
      "blocks.reference",
      "blocks.hero",
      "blocks.teaser",
    ]);
  });

  it("never offers references inside shared blocks", () => {
    const files = build(["hero"]);
    expect(parsed(files, "api/shared-block/content-types/shared-block/schema.json").attributes.blocks.components).toEqual([
      "blocks.hero",
    ]);
  });

  it("applies info and new attributes from an extension", () => {
    const files = build([], {
      page: { info: { displayName: "Seite" }, attributes: { hero: { type: "media", multiple: false } } },
      "shared.seo": { attributes: { noindex: { type: "boolean" } } },
    });
    const pageSchema = parsed(files, "api/page/content-types/page/schema.json");
    expect(pageSchema.info).toEqual({ singularName: "page", pluralName: "pages", displayName: "Seite" });
    expect(pageSchema.attributes.hero).toEqual({ type: "media", multiple: false });
    expect(pageSchema.attributes.title).toEqual({ type: "string" });
    expect(parsed(files, "components/shared/seo.json").attributes.noindex).toEqual({ type: "boolean" });
  });

  it("rejects redefining a platform attribute", () => {
    expect(problems(() => build([], { page: { attributes: { title: { type: "text" } } } }))).toEqual([
      expect.stringContaining('attribute "title" belongs to the platform'),
    ]);
  });

  it("rejects changing the names the REST routes depend on", () => {
    expect(problems(() => build([], { page: { info: { pluralName: "seiten" } } }))).toEqual([
      expect.stringContaining("info.pluralName is owned by the platform"),
    ]);
  });

  it("rejects unknown keys, malformed attributes and unknown schema names", () => {
    const found = problems(() =>
      build([], {
        page: { options: { draftAndPublish: false }, attributes: { hero: {} } },
        pgae: { attributes: {} },
        "shared.seo": "nope",
      })
    );
    expect(found).toEqual([
      expect.stringContaining('"options" cannot be extended'),
      expect.stringContaining('attribute "hero" needs a "type"'),
      expect.stringContaining("schema-extensions/shared.seo.json: must be a JSON object"),
      expect.stringContaining('no platform schema "pgae"'),
    ]);
  });

  it("rejects a site block that shadows a platform component", () => {
    expect(problems(() => build(["reference"]))).toEqual([
      expect.stringContaining("components/blocks/reference.json is a platform component"),
    ]);
  });

  it("is deterministic", () => {
    expect(build(["b", "a"])).toEqual(build(["a", "b"]));
  });
});

describe("planSync", () => {
  const generated = { "a.json": "A2\n", "b.json": "B\n" };

  it("writes everything into an empty app and records hashes", () => {
    const plan = planSync({}, {}, generated);
    expect(plan.write).toEqual(generated);
    expect(plan.remove).toEqual([]);
    expect(plan.manifest).toEqual({ "a.json": hash("A2\n"), "b.json": hash("B\n") });
  });

  it("updates files it generated before and leaves unchanged ones alone", () => {
    const plan = planSync(
      { "a.json": hash("A1\n"), "b.json": hash("B\n") },
      { "a.json": "A1\n", "b.json": "B\n" },
      generated
    );
    expect(plan.write).toEqual({ "a.json": "A2\n" });
  });

  it("removes generated files the platform no longer ships", () => {
    const plan = planSync({ "old.json": hash("O\n") }, { "old.json": "O\n" }, {});
    expect(plan.remove).toEqual(["old.json"]);
  });

  it("refuses to overwrite or remove a generated file that was edited by hand", () => {
    expect(
      problems(() =>
        planSync(
          { "a.json": hash("A1\n"), "old.json": hash("O\n") },
          { "a.json": "A1 edited\n", "old.json": "O edited\n" },
          { "a.json": "A2\n" }
        )
      )
    ).toEqual([expect.stringContaining("src/a.json was changed by hand"), expect.stringContaining("src/old.json was changed by hand")]);
  });

  it("adopts an identical unrecorded file, refuses a different one", () => {
    expect(planSync({}, { "a.json": "A2\n" }, { "a.json": "A2\n" }).write).toEqual({});
    expect(problems(() => planSync({}, { "a.json": "mine\n" }, { "a.json": "A2\n" }))).toEqual([
      expect.stringContaining("src/a.json exists but was not generated"),
    ]);
  });

  it("regenerates a recorded file that was deleted", () => {
    expect(planSync({ "a.json": hash("A1\n") }, {}, { "a.json": "A2\n" }).write).toEqual({ "a.json": "A2\n" });
  });
});
