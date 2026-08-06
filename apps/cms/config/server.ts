export default ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: { keys: env.array("APP_KEYS") },
  // Absolute URLs Strapi generates (media, admin links) use this.
  url: env("PUBLIC_URL", "http://127.0.0.1:1337"),
});
