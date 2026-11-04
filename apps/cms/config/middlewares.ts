import { middlewaresConfig } from "@janmarkuslanger/astro-strapi-platform/strapi-kit";

/** Add a site middleware with `(params) => [...middlewaresConfig(params), …]`. */
export default middlewaresConfig;
