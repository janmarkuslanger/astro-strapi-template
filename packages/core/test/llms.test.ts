import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "../src/index.js";
import { global, page, registry, type TestBlock } from "./fixtures.js";

const SITE = "https://acme.test";

describe("buildLlmsTxt", () => {
  it("starts with name, claim and contact", () => {
    const out = buildLlmsTxt(global, [], SITE, registry);
    expect(out.startsWith("# Acme\n\n> We make things.\n\nContact: hello@acme.test")).toBe(true);
  });

  it("omits the claim line when there is no claim", () => {
    const out = buildLlmsTxt({ ...global, claim: undefined }, [], SITE, registry);
    expect(out).not.toContain(">");
  });

  it("orders pages by navigation, unlisted pages last", () => {
    const out = buildLlmsTxt(global, [page("imprint"), page("home"), page("about")], SITE, registry);
    const order = ["### ABOUT", "### HOME", "### IMPRINT"].map((h) => out.indexOf(h));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("links home at / and other pages with a trailing slash", () => {
    const out = buildLlmsTxt(global, [page("home"), page("about")], SITE, registry);
    expect(out).toContain(`${SITE}/\n`);
    expect(out).toContain(`${SITE}/about/\n`);
  });

  it("includes the page's meta description", () => {
    const out = buildLlmsTxt(global, [page("about", [], "Who we are.")], SITE, registry);
    expect(out).toContain("/about/\nWho we are.");
  });

  it("lists each block's facts and drops empty ones", () => {
    const blocks: TestBlock[] = [
      { type: "text", body: "First fact." },
      { type: "text", body: "" },
      { type: "faq", items: [{ q: "Q", a: "A" }] },
    ];
    const out = buildLlmsTxt(global, [page("about", blocks)], SITE, registry);
    expect(out.match(/^- /gm)).toHaveLength(1);
    expect(out).toContain("- First fact.");
  });

  it("truncates long facts to 300 characters with an ellipsis", () => {
    const long = "word ".repeat(100);
    const out = buildLlmsTxt(global, [page("about", [{ type: "text", body: long }])], SITE, registry);
    const fact = out.split("\n").find((line) => line.startsWith("- "))!.slice(2);
    expect(fact.length).toBeLessThanOrEqual(300);
    expect(fact.endsWith("…")).toBe(true);
  });

  it("skips blocks the registry does not know", () => {
    const unknown = { type: "carousel" } as unknown as TestBlock;
    expect(() => buildLlmsTxt(global, [page("about", [unknown])], SITE, registry)).not.toThrow();
  });

  it("ends with exactly one newline", () => {
    const out = buildLlmsTxt(global, [page("home")], SITE, registry);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
