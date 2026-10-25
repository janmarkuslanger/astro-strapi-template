import { describe, expect, it } from "vitest";
import { organizationSchema, pageSchemas } from "../src/index.js";
import { global, page, registry, type TestBlock } from "./fixtures.js";

const SITE = "https://acme.test";

describe("organizationSchema", () => {
  it("describes the site as an Organization", () => {
    expect(organizationSchema(global, SITE)).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
      url: SITE,
      email: "hello@acme.test",
      description: "We make things.",
    });
  });

  it("has no description without a claim", () => {
    expect(organizationSchema({ ...global, claim: undefined }, SITE)).not.toHaveProperty("description");
  });
});

describe("pageSchemas", () => {
  const faq: TestBlock = { type: "faq", items: [{ q: "Why?", a: "Because." }] };

  it("adds the organization only on the home page", () => {
    expect(pageSchemas(page("home"), global, SITE, registry).map((s) => s["@type"])).toEqual(["Organization"]);
    expect(pageSchemas(page("about"), global, SITE, registry)).toEqual([]);
  });

  it("derives nodes from blocks, independent of the slug", () => {
    const schemas = pageSchemas(page("renamed-page", [faq]), global, SITE, registry);
    expect(schemas.map((s) => s["@type"])).toEqual(["FAQPage"]);
  });

  it("ignores blocks without jsonLd and unknown blocks", () => {
    const unknown = { type: "carousel" } as unknown as TestBlock;
    const blocks: TestBlock[] = [{ type: "text", body: "x" }, unknown, faq];
    expect(pageSchemas(page("about", blocks), global, SITE, registry)).toHaveLength(1);
  });
});
