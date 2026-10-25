import type { Core } from "@strapi/strapi";

/**
 * Grants the public role the given actions (e.g. "api::page.page.find"), so a
 * statically built frontend can fetch without a token. Idempotent.
 *
 * Done in code rather than clicked in the panel: a fresh install has to work
 * without a manual checklist, and a forgotten checkbox shows up as a
 * confusing 403 during the frontend build.
 *
 * Note this is ROLE permission, not FIELD permission. Strapi's field-level
 * permissions are separate and are NOT auto-granted for new fields — after
 * adding a field, editors will report they cannot see it, and the fix is in
 * Settings → Roles in the panel. See CLAUDE.md §5.
 */
export async function setPublicPermissions(
  strapi: Core.Strapi,
  actions: string[]
): Promise<void> {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!publicRole) return;

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
