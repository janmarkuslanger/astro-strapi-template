/**
 * The page with this slug renders at "/", so editors create the home page
 * like any other page — no special content type, no special case.
 */
export const HOME_SLUG = "home";

/** Site-relative URL of a page: "/" for the home page, "/<slug>/" otherwise. */
export function pageHref(slug: string): string {
  return slug === HOME_SLUG ? "/" : `/${slug}/`;
}

/** Inverse of {@link pageHref} for internal links, e.g. navigation entries. */
export function slugOfHref(href: string): string {
  return href.replace(/^\/|\/$/g, "") || HOME_SLUG;
}
