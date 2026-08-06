import type { Core } from "@strapi/strapi";
import { registerRebuildTrigger } from "./rebuild";
import { seedContent } from "./seed";

/**
 * Grants the public role read access to the content APIs, so the statically
 * built frontend can fetch without a token.
 *
 * Done in code rather than clicked in the panel: a fresh install has to work
 * without a manual checklist, and a forgotten checkbox here shows up as a
 * confusing 403 during the frontend build.
 *
 * Note this is ROLE permission, not FIELD permission. Strapi's field-level
 * permissions are separate and are NOT auto-granted for new fields — after
 * adding a field, editors will report they cannot see it, and the fix is in
 * Settings → Roles in the panel. See CLAUDE.md §5.
 */
async function setPublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!publicRole) return;

  const actions = [
    "api::page.page.find",
    "api::page.page.findOne",
    "api::shared-block.shared-block.find",
    "api::shared-block.shared-block.findOne",
    "api::global.global.find",
    // Add each new content type the frontend reads. Deliberately absent from
    // this list: anything private, e.g. form submissions — those must never be
    // readable over the public API.
  ];

  for (const action of actions) {
    const existing = await strapi.db
      .query("plugin::users-permissions.permission")
      .findOne({ where: { action, role: publicRole.id } });
    if (!existing) {
      await strapi.db
        .query("plugin::users-permissions.permission")
        .create({ data: { action, role: publicRole.id } });
    }
  }
}

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await setPublicPermissions(strapi);

    // Fills an empty database and does nothing at all once any content
    // exists — see seed.ts. Wrapped so a seed problem never blocks boot.
    try {
      await seedContent(strapi);
    } catch (error) {
      strapi.log.error("Seed failed:");
      strapi.log.error(String(error));
    }

    // Content changes have to reach the statically built site — see rebuild.ts.
    registerRebuildTrigger(strapi);
  },
};
