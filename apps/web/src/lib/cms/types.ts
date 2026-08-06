/**
 * Re-export of the shared domain model, so everything inside src/lib/cms and
 * every page imports from one place. Keeps the `@project/shared-types`
 * specifier out of dozens of files.
 */
export * from "@project/shared-types";
