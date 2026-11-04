import path from "node:path";
import type { Core } from "@strapi/strapi";
import { databaseConfig } from "@janmarkuslanger/powerhouse/strapi-kit";

/**
 * SQLite locally, Postgres in production (DATABASE_CLIENT). Compiled to
 * dist/config/, so the app root is two levels up.
 */
export default (params: Core.Config.Shared.ConfigParams) =>
  databaseConfig(params, path.join(__dirname, "..", ".."));
