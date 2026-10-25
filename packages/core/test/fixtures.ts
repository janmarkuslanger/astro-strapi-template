import type { BlockRegistry, Page, SiteGlobal } from "../src/index.js";

export interface TextBlock {
  type: "text";
  body: string;
}

export interface FaqBlock {
  type: "faq";
  items: { q: string; a: string }[];
}

export type TestBlock = TextBlock | FaqBlock;

export const registry: BlockRegistry<TestBlock> = {
  text: {
    cms: null,
    component: () => null,
    llms: (block) => [block.body],
  },
  faq: {
    cms: null,
    component: () => null,
    llms: () => [],
    jsonLd: (block) => [
      {
        "@type": "FAQPage",
        mainEntity: block.items.map((item) => ({ "@type": "Question", name: item.q })),
      },
    ],
  },
};

export const global: SiteGlobal = {
  siteName: "Acme",
  claim: "We make things.",
  email: "hello@acme.test",
  navigation: [
    { label: "About", href: "/about/" },
    { label: "Home", href: "/" },
  ],
  footerLinks: [],
};

export function page(slug: string, blocks: TestBlock[] = [], description = ""): Page<TestBlock> {
  return { slug, title: slug.toUpperCase(), seo: { title: slug, description }, blocks };
}
