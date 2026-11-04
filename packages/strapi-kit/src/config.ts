import path from "node:path";
import type { Core } from "@strapi/strapi";

/**
 * The CMS app's config, shared by every site. Each helper has the shape of a
 * Strapi config function, so a site's config file is one line — or spreads
 * the result and overrides what it needs:
 *
 *   // config/server.ts
 *   export default serverConfig;
 *   // config/middlewares.ts, with one more middleware
 *   export default (params) => [...middlewaresConfig(params), "global::my-middleware"];
 *
 * The environment variable names are part of the platform: the deployment
 * docs and every site's server .env use them.
 */
type Params = Core.Config.Shared.ConfigParams;

export const adminConfig = ({ env }: Params) => ({
  auth: { secret: env("ADMIN_JWT_SECRET") },
  apiToken: { salt: env("API_TOKEN_SALT") },
  transfer: { token: { salt: env("TRANSFER_TOKEN_SALT") } },
});

export const serverConfig = ({ env }: Params) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: { keys: env.array("APP_KEYS") },
  // Absolute URLs Strapi generates (media, admin links) use this.
  url: env("PUBLIC_URL", "http://127.0.0.1:1337"),
});

/**
 * SQLite locally, Postgres in production. Switch with DATABASE_CLIENT.
 *
 * @param appRoot the CMS app directory; the SQLite file (default
 *   `.tmp/data.db`, gitignored) lives under it. Deleting it is the supported
 *   way to re-seed.
 */
export const databaseConfig = ({ env }: Params, appRoot: string) => {
  if (env("DATABASE_CLIENT", "sqlite") === "postgres") {
    return {
      connection: {
        client: "postgres",
        connection: {
          host: env("DATABASE_HOST", "127.0.0.1"),
          port: env.int("DATABASE_PORT", 5432),
          database: env("DATABASE_NAME", "strapi"),
          user: env("DATABASE_USERNAME", "strapi"),
          password: env("DATABASE_PASSWORD"),
          ssl: env.bool("DATABASE_SSL", false),
        },
        pool: { min: 0, max: 10 },
      },
    };
  }
  return {
    connection: {
      client: "sqlite",
      connection: { filename: path.join(appRoot, env("DATABASE_FILENAME", ".tmp/data.db")) },
      useNullAsDefault: true,
    },
  };
};

export const middlewaresConfig = ({ env }: Params): (string | { name: string; config: object })[] => [
  "strapi::logger",
  "strapi::errors",
  "strapi::security",
  {
    name: "strapi::cors",
    config: {
      // Restrict to the frontend domains in production. A wide-open CORS
      // policy on a CMS that also receives form posts is an invitation.
      origin: env.array("CORS_ORIGINS", ["http://localhost:4321"]),
    },
  },
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];

export const pluginsConfig = ({ env }: Params) => ({
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST"),
        port: env.int("SMTP_PORT", 587),
        secure: env.bool("SMTP_SECURE", false),
        auth: {
          user: env("SMTP_USERNAME"),
          pass: env("SMTP_PASSWORD"),
        },
      },
      settings: {
        defaultFrom: env("EMAIL_FROM"),
        defaultReplyTo: env("EMAIL_REPLY_TO", env("EMAIL_FROM")),
      },
    },
  },
});
