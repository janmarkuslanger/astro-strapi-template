export default ({ env }) => [
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
