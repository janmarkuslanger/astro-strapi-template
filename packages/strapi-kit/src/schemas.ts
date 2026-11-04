import { createHash } from "node:crypto";

/**
 * Platform schemas for a site's Strapi app. Pure: the CLI (schemas-cli.ts)
 * reads and writes the files, everything deciding *what* to write lives here.
 *
 * The platform owns its content types and components (page, shared-block,
 * global, shared.*, blocks.reference). A site extends them through
 * `schema-extensions/<name>.json` and never edits the generated files —
 * otherwise the next platform version could not update them.
 */

/** Paths relative to the Strapi app's `src/`, posix separators. */
export type FileMap = Record<string, string>;

export interface SchemaInputs {
  /** The platform's schema files, as shipped in this package. */
  platform: FileMap;
  /** Names of the site's own block components (`src/components/blocks/<name>.json`). */
  siteBlocks: string[];
  /** Parsed `schema-extensions/<name>.json`, keyed by `<name>`. */
  extensions: Record<string, unknown>;
}

/** Path → sha256 of each generated file, as last written. */
export type Manifest = Record<string, string>;

export interface SyncPlan {
  write: FileMap;
  remove: string[];
  manifest: Manifest;
}

/** Every problem found, so one run reports them all. */
export class SchemaError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "SchemaError";
  }
}

const EXTENSION_KEYS = new Set(["info", "attributes"]);
// Not singularName/pluralName: they name the REST routes the frontend reads.
const EXTENSION_INFO_KEYS = new Set(["displayName", "description", "icon"]);

const CONTENT_TYPE = /^api\/[^/]+\/content-types\/([^/]+)\/schema\.json$/;
const COMPONENT = /^components\/([^/]+)\/([^/]+)\.json$/;

/**
 * Extension name of a platform schema file: the content type's singular name
 * (`page`) or the component uid (`shared.seo`). The dot keeps them apart.
 */
export function extensionName(path: string): string | null {
  const ct = CONTENT_TYPE.exec(path);
  if (ct) return ct[1];
  const component = COMPONENT.exec(path);
  if (component) return `${component[1]}.${component[2]}`;
  return null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function applyExtension(
  name: string,
  schema: Record<string, any>,
  extension: unknown,
  problems: string[]
): void {
  const where = `schema-extensions/${name}.json`;
  if (!isObject(extension)) {
    problems.push(`${where}: must be a JSON object with "info" and/or "attributes".`);
    return;
  }
  for (const key of Object.keys(extension)) {
    if (!EXTENSION_KEYS.has(key)) {
      problems.push(`${where}: "${key}" cannot be extended; only "info" and "attributes".`);
    }
  }
  if (extension.info !== undefined) {
    if (!isObject(extension.info)) {
      problems.push(`${where}: "info" must be an object.`);
    } else {
      for (const [key, value] of Object.entries(extension.info)) {
        if (!EXTENSION_INFO_KEYS.has(key)) {
          problems.push(
            `${where}: info.${key} is owned by the platform; a site may set ${[...EXTENSION_INFO_KEYS].join(", ")}.`
          );
        } else if (typeof value !== "string") {
          problems.push(`${where}: info.${key} must be a string.`);
        } else {
          schema.info[key] = value;
        }
      }
    }
  }
  if (extension.attributes !== undefined) {
    if (!isObject(extension.attributes)) {
      problems.push(`${where}: "attributes" must be an object.`);
    } else {
      for (const [key, attribute] of Object.entries(extension.attributes)) {
        if (key in schema.attributes) {
          problems.push(
            `${where}: attribute "${key}" belongs to the platform and cannot be redefined; add a field with another name.`
          );
        } else if (!isObject(attribute) || typeof attribute.type !== "string") {
          problems.push(`${where}: attribute "${key}" needs a "type".`);
        } else {
          schema.attributes[key] = attribute;
        }
      }
    }
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The files the site's `src/` must contain: platform schemas with the site's
 * extensions applied and every site block added to the platform's dynamic
 * zones. Blocks the platform lists itself (`blocks.reference` on pages) keep
 * their place; `shared-block` lists none, so a shared block can never hold a
 * reference and cycles stay impossible by construction.
 */
export function buildSchemas({ platform, siteBlocks, extensions }: SchemaInputs): FileMap {
  const problems: string[] = [];
  const files: FileMap = {};
  const known = new Set<string>();
  const blockUids = [...siteBlocks].sort().map((name) => `blocks.${name}`);

  for (const [path, content] of Object.entries(platform)) {
    const name = extensionName(path);
    if (!name) {
      files[path] = content;
      continue;
    }
    known.add(name);
    const schema = JSON.parse(content);
    if (CONTENT_TYPE.test(path)) {
      for (const attribute of Object.values<Record<string, any>>(schema.attributes)) {
        if (attribute.type === "dynamiczone") {
          attribute.components = [...new Set([...attribute.components, ...blockUids])];
        }
      }
    }
    if (name in extensions) applyExtension(name, schema, extensions[name], problems);
    files[path] = json(schema);
  }

  for (const name of Object.keys(extensions)) {
    if (!known.has(name)) {
      problems.push(
        `schema-extensions/${name}.json: no platform schema "${name}". Known: ${[...known].sort().join(", ")}.`
      );
    }
  }
  for (const name of siteBlocks) {
    if (`components/blocks/${name}.json` in platform) {
      problems.push(`components/blocks/${name}.json is a platform component; give the site block another name.`);
    }
  }

  if (problems.length) throw new SchemaError(problems);
  return files;
}

export const hash = (content: string) => createHash("sha256").update(content).digest("hex");

/**
 * What to write and remove so `src/` matches `generated`, refusing to
 * overwrite anything a person changed. A generated file that differs from its
 * manifest hash was edited by hand (e.g. in the Content-Type Builder); a file
 * the manifest does not know but that differs from the platform's was never
 * generated. Both would be lost silently, so both stop the run instead.
 *
 * @param disk current content of every path in `generated` or `manifest`,
 *   `undefined` where the file does not exist
 */
export function planSync(
  manifest: Manifest,
  disk: Record<string, string | undefined>,
  generated: FileMap
): SyncPlan {
  const problems: string[] = [];
  const edited = (path: string) =>
    `src/${path} was changed by hand. Platform schemas are generated: move the change into schema-extensions/, then delete the file and run again.`;

  const write: FileMap = {};
  for (const [path, content] of Object.entries(generated)) {
    const current = disk[path];
    if (current === undefined) {
      write[path] = content;
    } else if (path in manifest) {
      if (hash(current) !== manifest[path]) problems.push(edited(path));
      else if (current !== content) write[path] = content;
    } else if (current !== content) {
      problems.push(
        `src/${path} exists but was not generated. It is a platform schema now: move site changes into schema-extensions/, then delete the file and run again.`
      );
    }
  }

  const remove: string[] = [];
  for (const [path, recorded] of Object.entries(manifest)) {
    if (path in generated) continue;
    const current = disk[path];
    if (current === undefined) continue;
    if (hash(current) !== recorded) problems.push(edited(path));
    else remove.push(path);
  }

  if (problems.length) throw new SchemaError(problems);
  const next: Manifest = {};
  for (const path of Object.keys(generated).sort()) next[path] = hash(generated[path]);
  return { write, remove, manifest: next };
}
