import { vi } from "vitest";
import type { Core } from "@strapi/strapi";

/**
 * In-memory stand-in for the parts of Strapi the kit touches. Strapi and its
 * database are the I/O boundary; everything behind them is faked here, the
 * kit itself runs for real.
 */
export interface FakeOptions {
  /** uid → draftAndPublish. A uid missing here does not exist. */
  contentTypes?: Record<string, boolean>;
  /** uid → number of existing documents. */
  existing?: Record<string, number>;
  /** File names already in the media library. */
  library?: string[];
  publicRole?: boolean;
  /** Existing public-role permission actions. */
  permissions?: string[];
}

export function fakeStrapi(options: FakeOptions = {}) {
  const contentTypes = options.contentTypes ?? {};
  let inTransaction = false;
  let transactions = 0;
  let nextId = 1;

  const created: { uid: string; params: any; inTransaction: boolean }[] = [];
  const uploads: string[] = [];
  const permissionsCreated: string[] = [];
  const handlers = new Map<string, ((payload: unknown) => unknown)[]>();
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const queries: Record<string, { findOne: (q: any) => Promise<any>; create?: (q: any) => Promise<any> }> = {
    "plugin::users-permissions.role": {
      findOne: async () => (options.publicRole === false ? null : { id: 42 }),
    },
    "plugin::users-permissions.permission": {
      findOne: async ({ where }) => ((options.permissions ?? []).includes(where.action) ? { id: 1 } : null),
      create: async ({ data }) => {
        permissionsCreated.push(`${data.action}@${data.role}`);
        return data;
      },
    },
    "plugin::upload.file": {
      findOne: async ({ where }) =>
        (options.library ?? []).includes(where.name) ? { id: `existing-${where.name}`, name: where.name } : null,
    },
  };

  const strapi = {
    log,
    contentType: (uid: string) => {
      if (!(uid in contentTypes)) throw new Error(`unknown content type ${uid}`);
      return { options: { draftAndPublish: contentTypes[uid] } };
    },
    documents: (uid: string) => ({
      count: async () => options.existing?.[uid] ?? 0,
      create: async (params: any) => {
        created.push({ uid, params, inTransaction });
        return { documentId: `doc-${nextId++}` };
      },
    }),
    db: {
      query: (uid: string) => queries[uid],
      transaction: async (cb: () => Promise<unknown>) => {
        transactions += 1;
        inTransaction = true;
        try {
          return await cb();
        } finally {
          inTransaction = false;
        }
      },
    },
    plugin: () => ({
      service: () => ({
        upload: async ({ files }: { files: { originalFilename: string } }) => {
          uploads.push(files.originalFilename);
          return [{ id: `upload-${files.originalFilename}` }];
        },
      }),
    }),
    eventHub: {
      on: (event: string, handler: (payload: unknown) => unknown) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
    },
  };

  return {
    // The kit is typed against the real Strapi; this fake implements only
    // what it calls, which is the point of the fake.
    strapi: strapi as unknown as Core.Strapi,
    log,
    created,
    uploads,
    permissionsCreated,
    get transactions() {
      return transactions;
    },
    subscribed: () => [...handlers.keys()].sort(),
    emit: async (event: string, payload: unknown) => {
      for (const handler of handlers.get(event) ?? []) await handler(payload);
    },
  };
}
