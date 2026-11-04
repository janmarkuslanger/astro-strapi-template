import type { Core } from "@strapi/strapi";
import {
  PLATFORM_CONTENT_TYPES,
  PLATFORM_PUBLIC_ACTIONS,
  registerRebuildTrigger,
  seedContent,
  setPublicPermissions,
} from "@janmarkuslanger/astro-strapi-platform/strapi-kit";

const seedSharedBlocks: any[] = require("@project/shared-content/shared-blocks.json");
const seedPages: any[] = require("@project/shared-content/pages.json");
const seedGlobal: any = require("@project/shared-content/global.json");

/**
 * What the frontend may read without a token: the platform types plus each
 * site content type the frontend reads. Deliberately absent: anything
 * private, e.g. form submissions — those must never be readable over the
 * public API.
 */
const PUBLIC_ACTIONS = [...PLATFORM_PUBLIC_ACTIONS];

/**
 * Content types visible on the site; a change to one rebuilds it. Not here:
 * form submissions — a visitor sending a message must not cause a deploy.
 */
const WATCHED = [...PLATFORM_CONTENT_TYPES];

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await setPublicPermissions(strapi, PUBLIC_ACTIONS);

    // Fills an empty database once and never again. Steps in dependency
    // order: shared blocks first, pages reference them by name. Wrapped so a
    // seed problem never blocks boot.
    try {
      await seedContent(strapi, {
        steps: [
          {
            uid: "api::shared-block.shared-block",
            entries: seedSharedBlocks,
            ref: { key: "name", token: "__sharedBlock" },
          },
          { uid: "api::page.page", entries: seedPages },
          { uid: "api::global.global", entries: seedGlobal },
        ],
      });
    } catch (error) {
      strapi.log.error("Seed failed:");
      strapi.log.error(String(error));
    }

    // Content changes have to reach the statically built site.
    registerRebuildTrigger(strapi, { watched: WATCHED });
  },
};
