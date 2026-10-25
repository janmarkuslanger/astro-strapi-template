import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import RichText from "../src/blocks/rich-text/RichText.astro";
import richText, { type RichTextBlock } from "../src/blocks/rich-text";

const ctx = {
  image: () => undefined,
  markdown: (value: unknown) => (value ? `<p>${String(value)}</p>` : ""),
};

describe("rich-text block", () => {
  it("maps heading and Markdown body from Strapi", () => {
    expect(richText.cms.map({ heading: "Hi", body: "text" }, ctx)).toEqual({ heading: "Hi", html: "<p>text</p>" });
  });

  it("maps a missing heading to undefined", () => {
    expect(richText.cms.map({ heading: null, body: "" }, ctx)).toEqual({ heading: undefined, html: "" });
  });

  it("contributes its text, without markup, to llms.txt", () => {
    const block: RichTextBlock = { type: "richText", html: "<p>One <strong>two</strong></p>\n<p>three</p>" };
    expect(richText.llms(block)).toEqual(["One two three"]);
  });

  describe("component", () => {
    let container: AstroContainer;
    beforeAll(async () => {
      container = await AstroContainer.create();
    });

    it("renders the heading and the pre-rendered HTML", async () => {
      const html = await container.renderToString(RichText, {
        props: { block: { type: "richText", heading: "Title", html: "<p><em>body</em></p>" } },
      });
      expect(html).toMatch(/<h2[^>]*>Title<\/h2>/);
      expect(html).toContain("<p><em>body</em></p>");
    });

    it("renders no heading element without a heading", async () => {
      const html = await container.renderToString(RichText, { props: { block: { type: "richText", html: "<p>x</p>" } } });
      expect(html).not.toContain("<h2");
    });
  });
});
