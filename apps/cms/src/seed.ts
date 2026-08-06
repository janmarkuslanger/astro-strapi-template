import fs from "node:fs";
import path from "node:path";
import type { Core } from "@strapi/strapi";

/**
 * Initial content from @project/shared-content.
 *
 * Runs exactly once, into an empty database: the fixtures are the starting
 * state of a fresh installation, nothing more. As soon as any content exists —
 * from an earlier seed or written in the panel — seeding steps aside and never
 * touches the database again. The CMS is then the single source of truth, and
 * nobody can lose an afternoon of editing to a restart.
 *
 * There is deliberately NO force flag. If you want one, you want a database
 * reset instead:  rm -rf apps/cms/.tmp && npm run dev:cms
 *
 * Structure (content types, blocks, fields) still comes from code and ships
 * with every deploy; only the *content* is one-way and one-time.
 *
 * Untouched either way: the media library (files are matched by name and
 * reused, so re-seeding never piles up duplicates) and anything a visitor
 * created, such as form submissions.
 *
 * Extending: add your content type to CONTENT_TYPES so it counts as "the site
 * has content", add its fixture file, and create it below in dependency order.
 */

const seedSharedBlocks: any[] = require("@project/shared-content/shared-blocks.json");
const seedPages: any[] = require("@project/shared-content/pages.json");
const seedGlobal: any = require("@project/shared-content/global.json");

/** Every content type that counts as "the site already has content". */
const CONTENT_TYPES = [
  "api::page.page",
  "api::shared-block.shared-block",
  "api::global.global",
] as const;

async function hasContent(strapi: Core.Strapi): Promise<boolean> {
  for (const uid of CONTENT_TYPES) {
    const count = await strapi.documents(uid as any).count({});
    if (count > 0) return true;
  }
  return false;
}

/** Uploads images from apps/cms/data/uploads, indexed by file name. */
async function uploadSeedImages(strapi: Core.Strapi): Promise<Map<string, any>> {
  const uploaded = new Map<string, any>();
  const uploadDir = path.resolve(process.cwd(), "data", "uploads");
  if (!fs.existsSync(uploadDir)) return uploaded;

  const uploadService = strapi.plugin("upload").service("upload");

  for (const fileName of fs.readdirSync(uploadDir)) {
    if (!/\.(jpe?g|png|webp|svg)$/i.test(fileName)) continue;

    // Reuse a file already in the library — re-seeding against an emptied
    // content table must not create duplicates.
    const existing = await strapi.db
      .query("plugin::upload.file")
      .findOne({ where: { name: fileName } });
    if (existing) {
      uploaded.set(fileName, existing);
      continue;
    }

    const filePath = path.join(uploadDir, fileName);
    const ext = path.extname(fileName).toLowerCase();
    const mimetype =
      ext === ".png" ? "image/png"
      : ext === ".webp" ? "image/webp"
      : ext === ".svg" ? "image/svg+xml"
      : "image/jpeg";

    const [file] = await uploadService.upload({
      data: {},
      files: {
        filepath: filePath,
        originalFilename: fileName,
        mimetype,
        size: fs.statSync(filePath).size,
      },
    });
    uploaded.set(fileName, file);
  }

  return uploaded;
}

/**
 * Replaces `{ "__file": "name.jpg" }` in the fixtures with the uploaded file's
 * id, so fixtures can reference images without knowing database ids.
 */
function resolveFiles(value: any, files: Map<string, any>): any {
  if (Array.isArray(value)) return value.map((v) => resolveFiles(v, files));
  if (value && typeof value === "object") {
    if (typeof value.__file === "string") {
      return files.get(value.__file)?.id ?? null;
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveFiles(v, files)])
    );
  }
  return value;
}

export async function seedContent(strapi: Core.Strapi): Promise<void> {
  if (await hasContent(strapi)) {
    strapi.log.info("Seed: content already exists — skipped.");
    return;
  }

  strapi.log.info("Seed: empty database — creating initial content.");
  const files = await uploadSeedImages(strapi);

  // Shared blocks first: pages reference them by name.
  const sharedBlockIds = new Map<string, string>();
  for (const block of seedSharedBlocks) {
    const created = await strapi.documents("api::shared-block.shared-block").create({
      data: resolveFiles(block, files),
      status: "published",
    });
    sharedBlockIds.set(block.name, created.documentId);
  }

  /** Turns `{ "__sharedBlock": "Name" }` into the created block's id. */
  const resolveRefs = (value: any): any => {
    if (Array.isArray(value)) return value.map(resolveRefs);
    if (value && typeof value === "object") {
      if (typeof value.__sharedBlock === "string") {
        return sharedBlockIds.get(value.__sharedBlock) ?? null;
      }
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, resolveRefs(v)])
      );
    }
    return value;
  };

  for (const page of seedPages) {
    await strapi.documents("api::page.page").create({
      data: resolveRefs(resolveFiles(page, files)),
      status: "published",
    });
  }

  await strapi.documents("api::global.global").create({
    data: resolveRefs(resolveFiles(seedGlobal, files)),
  });

  strapi.log.info("Seed: done.");
}
