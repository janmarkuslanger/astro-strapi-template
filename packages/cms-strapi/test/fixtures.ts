import { defineBlock, type StrapiBlockRegistry } from "../src/index.js";

export interface TextBlock {
  type: "text";
  heading?: string;
  html: string;
}

export interface ImageBlock {
  type: "image";
  image?: { src: string; alt: string };
}

export type TestBlock = TextBlock | ImageBlock;

export const blocks: StrapiBlockRegistry<TestBlock> = {
  text: defineBlock<TextBlock>({
    cms: {
      component: "blocks.text",
      map: (raw, ctx) => ({ heading: raw.heading ?? undefined, html: ctx.markdown(raw.body) }),
    },
    component: () => null,
    llms: () => [],
  }),
  image: defineBlock<ImageBlock>({
    cms: {
      component: "blocks.image",
      populate: "[populate][image]=true",
      map: (raw, ctx) => ({ image: ctx.image(raw.image) }),
    },
    component: () => null,
    llms: () => [],
  }),
};
