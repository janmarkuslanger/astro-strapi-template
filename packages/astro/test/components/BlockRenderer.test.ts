import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { BlockRegistry } from "@janmarkuslanger/powerhouse-core";
import { beforeAll, describe, expect, it } from "vitest";
import BlockRenderer from "../../src/BlockRenderer.astro";
import Echo from "./Echo.astro";

interface EchoBlock {
  type: "echo";
  text: string;
}

const registry: BlockRegistry<EchoBlock> = {
  echo: { cms: null, component: Echo, llms: () => [] },
};

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (blocks: unknown[]) =>
  container.renderToString(BlockRenderer, { props: { blocks, registry } });

describe("BlockRenderer", () => {
  it("renders each block with its registered component, in order", async () => {
    const html = await render([
      { type: "echo", text: "one" },
      { type: "echo", text: "two" },
    ]);
    expect([...html.matchAll(/<p data-echo[^>]*>(\w+)<\/p>/g)].map((m) => m[1])).toEqual(["one", "two"]);
  });

  it("renders nothing for an unknown block and keeps the rest", async () => {
    const html = await render([{ type: "carousel" }, { type: "echo", text: "kept" }]);
    expect(html).toContain("kept");
    expect(html.match(/data-echo/g)).toHaveLength(1);
  });

  it("renders an empty page without blocks", async () => {
    expect((await render([])).trim()).toBe("");
  });
});
