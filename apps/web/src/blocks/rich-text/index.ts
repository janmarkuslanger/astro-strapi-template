import { defineBlock } from "@janmarkuslanger/cms-strapi";
import RichText from "./RichText.astro";

/**
 * Example block — the smallest one that is still useful. Replace it.
 *
 * Note `html` rather than `markdown`: the mapper renders Markdown to HTML once,
 * at build time, so components never do parsing work and never decide how
 * content is interpreted.
 */
export interface RichTextBlock {
  type: "richText";
  heading?: string;
  /** Pre-rendered HTML, produced by `ctx.markdown`. */
  html: string;
}

export default defineBlock<RichTextBlock>({
  cms: {
    component: "blocks.rich-text",
    map: (raw, ctx) => ({
      heading: raw.heading ?? undefined,
      html: ctx.markdown(raw.body),
    }),
  },
  component: RichText,
  llms: (block) => [block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()],
});
