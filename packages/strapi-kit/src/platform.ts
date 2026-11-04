/**
 * The content types this package's schemas define (see schemas/). A site
 * spreads these into its own lists, so a platform type added or renamed in a
 * new version is public and watched without a site change.
 */
export const PLATFORM_CONTENT_TYPES = [
  "api::page.page",
  "api::shared-block.shared-block",
  "api::global.global",
];

/** Read access the frontend needs to the platform types, nothing more. */
export const PLATFORM_PUBLIC_ACTIONS = [
  "api::page.page.find",
  "api::page.page.findOne",
  "api::shared-block.shared-block.find",
  "api::shared-block.shared-block.findOne",
  "api::global.global.find",
];
