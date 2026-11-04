import { env } from "@strapi/utils";
import { describe, expect, it, vi } from "vitest";
import { databaseConfig, middlewaresConfig, pluginsConfig, serverConfig } from "../src/index";

// Strapi's real env helper: it reads process.env on every call.
const params = { env };

describe("serverConfig", () => {
  it("listens on all interfaces, port 1337 and the local URL by default", () => {
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("PUBLIC_URL", undefined);
    vi.stubEnv("APP_KEYS", "a,b");
    expect(serverConfig(params)).toEqual({
      host: "0.0.0.0",
      port: 1337,
      app: { keys: ["a", "b"] },
      url: "http://127.0.0.1:1337",
    });
  });

  it("takes port and public URL from the environment", () => {
    vi.stubEnv("PORT", "1338");
    vi.stubEnv("PUBLIC_URL", "https://cms.acme.test");
    expect(serverConfig(params)).toMatchObject({ port: 1338, url: "https://cms.acme.test" });
  });
});

describe("databaseConfig", () => {
  it("uses SQLite under the app root by default", () => {
    vi.stubEnv("DATABASE_CLIENT", undefined);
    vi.stubEnv("DATABASE_FILENAME", undefined);
    expect(databaseConfig(params, "/srv/cms").connection).toEqual({
      client: "sqlite",
      connection: { filename: "/srv/cms/.tmp/data.db" },
      useNullAsDefault: true,
    });
  });

  it("switches to Postgres with DATABASE_CLIENT", () => {
    vi.stubEnv("DATABASE_CLIENT", "postgres");
    vi.stubEnv("DATABASE_HOST", "db");
    vi.stubEnv("DATABASE_PASSWORD", "secret");
    vi.stubEnv("DATABASE_SSL", "true");
    expect(databaseConfig(params, "/srv/cms").connection).toMatchObject({
      client: "postgres",
      connection: { host: "db", port: 5432, database: "strapi", user: "strapi", password: "secret", ssl: true },
    });
  });
});

describe("middlewaresConfig", () => {
  it("restricts CORS to CORS_ORIGINS", () => {
    vi.stubEnv("CORS_ORIGINS", "https://acme.test,https://www.acme.test");
    const cors = middlewaresConfig(params).find((m) => typeof m === "object" && m.name === "strapi::cors");
    expect(cors).toEqual({ name: "strapi::cors", config: { origin: ["https://acme.test", "https://www.acme.test"] } });
  });
});

describe("pluginsConfig", () => {
  it("replies to EMAIL_FROM unless EMAIL_REPLY_TO is set", () => {
    vi.stubEnv("EMAIL_FROM", "site@acme.test");
    vi.stubEnv("EMAIL_REPLY_TO", undefined);
    expect(pluginsConfig(params).email.config.settings).toEqual({
      defaultFrom: "site@acme.test",
      defaultReplyTo: "site@acme.test",
    });
  });
});
