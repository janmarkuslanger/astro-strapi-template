import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedContent, type SeedStep } from "../src/index";
import { fakeStrapi } from "./fake-strapi";

const PAGE = "api::page.page";
const SHARED = "api::shared-block.shared-block";
const GLOBAL = "api::global.global";
const contentTypes = { [PAGE]: true, [SHARED]: true, [GLOBAL]: false };

let uploadsDir: string;

beforeEach(() => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-uploads-"));
});

afterEach(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const steps = (overrides: Partial<Record<string, unknown>> = {}): SeedStep[] => [
  { uid: SHARED, entries: [{ name: "Footer" }], ref: { key: "name", token: "__sharedBlock" } },
  { uid: PAGE, entries: [{ slug: "home", blocks: [{ block: { __sharedBlock: "Footer" } }] }] },
  { uid: GLOBAL, entries: overrides.global ?? { siteName: "Acme" } },
];

describe("seedContent", () => {
  it("does nothing when any step's type already has content", async () => {
    const fake = fakeStrapi({ contentTypes, existing: { [GLOBAL]: 1 } });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir });
    expect(fake.created).toEqual([]);
    expect(fake.uploads).toEqual([]);
  });

  it("creates entries in step order, a single object as one entry", async () => {
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir });
    expect(fake.created.map((c) => c.uid)).toEqual([SHARED, PAGE, GLOBAL]);
    expect(fake.created[2].params.data).toEqual({ siteName: "Acme" });
  });

  it("publishes draft & publish types and sets no status on the others", async () => {
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir });
    expect(fake.created.map((c) => c.params.status)).toEqual(["published", "published", undefined]);
    expect(fake.created[2].params).not.toHaveProperty("status");
  });

  it("replaces ref tokens with the documentId created earlier", async () => {
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir });
    expect(fake.created[1].params.data.blocks).toEqual([{ block: "doc-1" }]);
  });

  it("resolves a ref to an unknown name to null", async () => {
    const fake = fakeStrapi({ contentTypes });
    const custom = steps();
    custom[1] = { uid: PAGE, entries: [{ block: { __sharedBlock: "Nope" } }] };
    await seedContent(fake.strapi, { steps: custom, uploadsDir });
    expect(fake.created[1].params.data.block).toBeNull();
  });

  it("uploads images once and replaces __file with the file id", async () => {
    fs.writeFileSync(path.join(uploadsDir, "logo.png"), "png");
    fs.writeFileSync(path.join(uploadsDir, "notes.txt"), "not an image");
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, {
      steps: steps({ global: { logo: { __file: "logo.png" }, missing: { __file: "gone.jpg" } } }),
      uploadsDir,
    });
    expect(fake.uploads).toEqual(["logo.png"]);
    expect(fake.created[2].params.data).toEqual({ logo: "upload-logo.png", missing: null });
  });

  it("reuses a file already in the media library instead of uploading it again", async () => {
    fs.writeFileSync(path.join(uploadsDir, "logo.png"), "png");
    const fake = fakeStrapi({ contentTypes, library: ["logo.png"] });
    await seedContent(fake.strapi, { steps: steps({ global: { logo: { __file: "logo.png" } } }), uploadsDir });
    expect(fake.uploads).toEqual([]);
    expect(fake.created[2].params.data.logo).toBe("existing-logo.png");
  });

  it("works without an uploads directory", async () => {
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir: path.join(uploadsDir, "absent") });
    expect(fake.created).toHaveLength(3);
  });

  it("creates everything inside one transaction", async () => {
    const fake = fakeStrapi({ contentTypes });
    await seedContent(fake.strapi, { steps: steps(), uploadsDir });
    expect(fake.transactions).toBe(1);
    expect(fake.created.every((c) => c.inTransaction)).toBe(true);
  });

  it("rejects when a step fails, so the transaction rolls back", async () => {
    const fake = fakeStrapi({ contentTypes });
    const failing = steps();
    failing[2] = { uid: "api::missing.missing", entries: {} };
    await expect(seedContent(fake.strapi, { steps: failing, uploadsDir })).rejects.toThrow("unknown content type");
    expect(fake.log.info).not.toHaveBeenCalledWith("Seed: done.");
  });
});
