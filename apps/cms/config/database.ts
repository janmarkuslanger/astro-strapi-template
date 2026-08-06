import path from "node:path";

/**
 * SQLite locally, Postgres in production. Switch with DATABASE_CLIENT.
 *
 * The SQLite file lives in .tmp/ and is gitignored — deleting it is the
 * supported way to re-seed (see src/seed.ts).
 */
export default ({ env }) => {
  const client = env("DATABASE_CLIENT", "sqlite");

  if (client === "postgres") {
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
      connection: {
        filename: path.join(
          __dirname,
          "..",
          "..",
          env("DATABASE_FILENAME", ".tmp/data.db")
        ),
      },
      useNullAsDefault: true,
    },
  };
};
