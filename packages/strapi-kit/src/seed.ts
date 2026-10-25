import fs from "node:fs";
import path from "node:path";
import type { Core } from "@strapi/strapi";

/**
 * Initial content from fixtures.
 *
 * Runs exactly once, into an empty database: the fixtures are the starting
 * state of a fresh installation, nothing more. As soon as any content exists —
 * from an earlier seed or written in the panel — seeding steps aside and never
 * touches the database again. The CMS is then the single source of truth, and
 * nobody can lose an afternoon of editing to a restart.
 *
 * There is deliberately NO force flag. If you want one, you want a database
 * reset instead (local SQLite: delete apps/cms/.tmp).
 *
 * Structure (content types, blocks, fields) still comes from code and ships
 * with every deploy; only the *content* is one-way and one-time.
 *
 * Untouched either way: the media library (files are matched by name and
 * reused, so re-seeding never piles up duplicates) and anything a visitor
 * created, such as form submissions.
 *
 * Extending: add a step for your content type, in dependency order. Every
 * step's type counts as "the site already has content".
 */

export interface SeedStep {
  /** Content type, e.g. "api::page.page". */
  uid: string;
  /** Fixture entries — an array, or a single object for a single type. */
  entries: any[] | any;
  /**
   * Makes created entries referable by later steps: `{ [token]: entry[key] }`
   * anywhere in a later fixture becomes the created documentId. Example:
   * `{ key: "name", token: "__sharedBlock" }`.
   */
  ref?: { key: string; token: string };
}

export interface SeedOptions {
  /** In dependency order: referenced types before the types that use them. */
  steps: SeedStep[];
  /**
   * Images to upload, referenced in fixtures as `{ "__file": "name.jpg" }`.
   * Default: `data/uploads` relative to the CMS app.
   */
  uploadsDir?: string;
}

async function hasContent(strapi: Core.Strapi, uids: string[]): Promise<boolean> {
  for (const uid of uids) {
    const count = await strapi.documents(uid as any).count({});
    if (count > 0) return true;
  }
  return false;
}

/** Uploads images from apps/cms/data/uploads, indexed by file name. */
async function uploadSeedImages(
  strapi: Core.Strapi,
  uploadDir: string
): Promise<Map<string, any>> {
  const uploaded = new Map<string, any>();
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

export async function seedContent(
  strapi: Core.Strapi,
  options: SeedOptions
): Promise<void> {
  if (await hasContent(strapi, options.steps.map((step) => step.uid))) {
    strapi.log.info("Seed: content already exists — skipped.");
    return;
  }

  strapi.log.info("Seed: empty database — creating initial content.");
  const files = await uploadSeedImages(
    strapi,
    options.uploadsDir ?? path.resolve(process.cwd(), "data", "uploads")
  );

  /** token → (fixture key → created documentId) */
  const refs = new Map<string, Map<string, string>>();

  /** Turns `{ "<token>": "Name" }` into the created entry's documentId. */
  const resolveRefs = (value: any): any => {
    if (Array.isArray(value)) return value.map(resolveRefs);
    if (value && typeof value === "object") {
      for (const [token, ids] of refs) {
        if (typeof value[token] === "string") return ids.get(value[token]) ?? null;
      }
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, resolveRefs(v)])
      );
    }
    return value;
  };

  for (const step of options.steps) {
    // Types with draft & publish are created published; for the others a
    // status means nothing.
    const draftAndPublish = Boolean(
      (strapi.contentType(step.uid as any) as any)?.options?.draftAndPublish
    );
    const entries = Array.isArray(step.entries) ? step.entries : [step.entries];
    const ids = new Map<string, string>();

    for (const entry of entries) {
      const created = await strapi.documents(step.uid as any).create({
        data: resolveRefs(resolveFiles(entry, files)),
        ...(draftAndPublish ? { status: "published" as const } : {}),
      });
      if (step.ref) ids.set(String(entry[step.ref.key]), created.documentId);
    }

    if (step.ref) refs.set(step.ref.token, ids);
  }

  strapi.log.info("Seed: done.");
}
