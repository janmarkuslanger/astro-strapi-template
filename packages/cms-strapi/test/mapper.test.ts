import { describe, expect, it, vi } from "vitest";
import {
  blockPopulate,
  mapBlocks,
  mapGlobal,
  mapImage,
  mapPage,
  type StrapiBlockMappings,
} from "../src/mapper.js";

const MEDIA = "https://cms.acme.test";

const mappings: StrapiBlockMappings = {
  text: {
    component: "blocks.text",
    map: (raw, ctx) => ({ heading: raw.heading, html: ctx.markdown(raw.body) }),
  },
  image: {
    component: "blocks.image",
    populate: "[populate][image]=true",
    map: (raw, ctx) => ({ image: ctx.image(raw.image) }),
  },
};

describe("blockPopulate", () => {
  it("populates one level by default, a custom fragment when given, and references", () => {
    expect(blockPopulate(mappings).split("&")).toEqual([
      "populate[blocks][on][blocks.text][populate]=*",
      "populate[blocks][on][blocks.image][populate][image]=true",
      "populate[blocks][on][blocks.reference][populate]=block",
    ]);
  });

  it("still populates references without any registered block", () => {
    expect(blockPopulate({})).toBe("populate[blocks][on][blocks.reference][populate]=block");
  });
});

describe("mapImage", () => {
  it("returns undefined for a missing image", () => {
    expect(mapImage(null, MEDIA)).toBeUndefined();
  });

  it("makes relative URLs absolute against the PUBLIC media URL", () => {
    const image = mapImage({ url: "/uploads/a.jpg", alternativeText: "A", width: 10, height: 5 }, MEDIA);
    expect(image).toEqual({ src: `${MEDIA}/uploads/a.jpg`, alt: "A", width: 10, height: 5 });
  });

  it("keeps absolute URLs (external upload providers)", () => {
    expect(mapImage({ url: "https://cdn.test/a.jpg" }, MEDIA)?.src).toBe("https://cdn.test/a.jpg");
  });

  it("defaults alt to an empty string and drops null dimensions", () => {
    expect(mapImage({ url: "/a.jpg", alternativeText: null, width: null }, MEDIA)).toEqual({
      src: `${MEDIA}/a.jpg`,
      alt: "",
      width: undefined,
      height: undefined,
    });
  });
});

describe("mapBlocks", () => {
  it("maps known components and adds the domain type", () => {
    const out = mapBlocks([{ __component: "blocks.text", heading: "H", body: "**b**" }], MEDIA, mappings);
    expect(out).toEqual([{ type: "text", heading: "H", html: "<p><strong>b</strong></p>\n" }]);
  });

  it("renders empty Markdown as an empty string", () => {
    const [block] = mapBlocks([{ __component: "blocks.text", body: null }], MEDIA, mappings);
    expect(block).toMatchObject({ html: "" });
  });

  it("gives every block the public media URL through ctx.image", () => {
    const [block] = mapBlocks([{ __component: "blocks.image", image: { url: "/x.png" } }], MEDIA, mappings);
    expect(block).toMatchObject({ image: { src: `${MEDIA}/x.png` } });
  });

  it("skips components it does not know instead of throwing", () => {
    const raw = [{ __component: "blocks.carousel" }, { __component: "blocks.text", body: "a" }];
    expect(mapBlocks(raw, MEDIA, mappings).map((b) => b.type)).toEqual(["text"]);
  });

  it("splices a reference's blocks in place, by documentId", () => {
    const resolve = vi.fn(() => [{ type: "text", html: "shared" }]);
    const raw = [
      { __component: "blocks.text", body: "before" },
      { __component: "blocks.reference", block: { documentId: "doc1", id: 7 } },
      { __component: "blocks.text", body: "after" },
    ];
    const out = mapBlocks(raw, MEDIA, mappings, resolve);
    expect(resolve).toHaveBeenCalledWith("doc1");
    expect(out.map((b) => ("html" in b ? b.html : undefined))).toEqual(["<p>before</p>\n", "shared", "<p>after</p>\n"]);
  });

  it("falls back to the numeric id of a reference", () => {
    const resolve = vi.fn(() => []);
    mapBlocks([{ __component: "blocks.reference", block: { id: 7 } }], MEDIA, mappings, resolve);
    expect(resolve).toHaveBeenCalledWith("7");
  });

  it("drops references without a target or without a resolver", () => {
    const resolve = vi.fn(() => []);
    expect(mapBlocks([{ __component: "blocks.reference", block: null }], MEDIA, mappings, resolve)).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    expect(mapBlocks([{ __component: "blocks.reference", block: { id: 1 } }], MEDIA, mappings)).toEqual([]);
  });

  it("never returns a reference block", () => {
    const out = mapBlocks([{ __component: "blocks.reference", block: { id: 1 } }], MEDIA, mappings, () => []);
    expect(out.some((b) => b.type === "reference")).toBe(false);
  });
});

describe("mapPage", () => {
  it("maps slug, title, seo and blocks", () => {
    const page = mapPage(
      { slug: "about", title: "About", seo: { title: "About us", description: "D" }, blocks: [] },
      MEDIA,
      mappings
    );
    expect(page).toEqual({ slug: "about", title: "About", seo: { title: "About us", description: "D" }, blocks: [] });
  });

  it("falls back to the page title when seo is missing", () => {
    expect(mapPage({ slug: "a", title: "A" }, MEDIA, mappings).seo).toEqual({ title: "A", description: "" });
  });

  it("tolerates an entry with no fields", () => {
    expect(mapPage({}, MEDIA, mappings)).toEqual({ slug: "", title: "", seo: { title: "", description: "" }, blocks: [] });
  });
});

describe("mapGlobal", () => {
  it("maps settings and keeps only links with an href", () => {
    const global = mapGlobal({
      siteName: "Acme",
      claim: null,
      email: "a@b.test",
      navigation: [{ label: "About", href: "/about/" }, { label: "Broken" }],
      footerLinks: [{ href: "/imprint/" }],
    });
    expect(global).toEqual({
      siteName: "Acme",
      claim: undefined,
      email: "a@b.test",
      navigation: [{ label: "About", href: "/about/" }],
      footerLinks: [{ label: "", href: "/imprint/" }],
    });
  });

  it("tolerates an empty entry", () => {
    expect(mapGlobal({})).toEqual({ siteName: "", claim: undefined, email: "", navigation: [], footerLinks: [] });
  });
});
