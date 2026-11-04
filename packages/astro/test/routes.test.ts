import { describe, expect, it } from "vitest";
import type { BlockRegistry, CmsRepository, Page, SiteGlobal } from "@janmarkuslanger/powerhouse-core";
import { llmsTxtRoute, pagePaths, robotsTxt, robotsTxtRoute } from "../src/routes";

type TextBlock = { type: "text"; body: string };
const blocks: BlockRegistry<TextBlock> = {
  text: { cms: {}, component: () => null, llms: (b) => [b.body] },
};
const page = (slug: string): Page<TextBlock> => ({
  slug,
  title: slug,
  seo: { title: slug, description: "" },
  blocks: [{ type: "text", body: `${slug} body` }],
});
const global: SiteGlobal = { siteName: "Acme", email: "a@b.test", navigation: [], footerLinks: [] };
const cms: CmsRepository<TextBlock> = {
  getGlobal: async () => global,
  listPages: async () => [page("home"), page("about")],
  getPage: async () => null,
};
const SITE = new URL("https://acme.test/");

describe("pagePaths", () => {
  it("renders the home page at / and passes every page as a prop", async () => {
    const paths = await pagePaths(cms);
    expect(paths.map((p) => p.params.slug)).toEqual([undefined, "about"]);
    expect(paths[1].props.page.title).toBe("about");
  });
});

describe("llmsTxtRoute", () => {
  it("serves llms.txt as plain text with absolute page URLs", async () => {
    const res = await llmsTxtRoute(cms, blocks)({ site: SITE });
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("# Acme");
    expect(body).toContain("https://acme.test/about/");
    expect(body).toContain("- about body");
  });

  it("fails the build when the CMS fails, instead of serving an empty file", async () => {
    const broken = { ...cms, listPages: async () => Promise.reject(new Error("502")) };
    await expect(llmsTxtRoute(broken, blocks)({ site: SITE })).rejects.toThrow("502");
  });
});

describe("robots.txt", () => {
  it("allows everyone by default and points at the sitemap", () => {
    const body = robotsTxt("https://acme.test");
    expect(body).not.toContain("Disallow");
    expect(body).toContain("User-agent: GPTBot\nAllow: /");
    expect(body.trim().endsWith("Sitemap: https://acme.test/sitemap-index.xml")).toBe(true);
  });

  it("can disallow AI crawlers while keeping search engines", () => {
    const body = robotsTxt("https://acme.test", { aiCrawlers: false });
    expect(body).toContain("User-agent: *\nAllow: /");
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(body).toContain(`User-agent: ${agent}\nDisallow: /`);
    }
  });

  it("serves it with the site URL, without a double slash", async () => {
    const body = await (await robotsTxtRoute()({ site: SITE })).text();
    expect(body).toContain("Sitemap: https://acme.test/sitemap-index.xml");
  });
});
