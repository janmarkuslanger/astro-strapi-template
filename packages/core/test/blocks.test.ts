import { describe, expect, it } from "vitest";
import { definitionFor } from "../src/index.js";
import { registry, type TestBlock } from "./fixtures.js";

describe("definitionFor", () => {
  it("returns the definition registered for the block's type", () => {
    const block: TestBlock = { type: "text", body: "hi" };
    expect(definitionFor(registry, block)).toBe(registry.text);
  });

  it("returns undefined for a type the registry does not know", () => {
    // A block from a newer CMS reaching an older frontend.
    const unknown = { type: "carousel" } as unknown as TestBlock;
    expect(definitionFor(registry, unknown)).toBeUndefined();
  });
});
