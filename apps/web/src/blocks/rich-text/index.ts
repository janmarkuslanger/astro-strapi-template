import { defineBlock } from "../../lib/blocks";
import type { RichTextBlock } from "../../lib/cms/types";
import RichText from "./RichText.astro";

/** Example block — the smallest one that is still useful. Replace it. */
export default defineBlock<RichTextBlock>({
  strapi: {
    component: "blocks.rich-text",
    map: (raw, ctx) => ({
      heading: raw.heading ?? undefined,
      html: ctx.markdown(raw.body),
    }),
  },
  component: RichText,
  llms: (block) => [block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()],
});
