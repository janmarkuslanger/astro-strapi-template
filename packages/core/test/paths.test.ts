import { describe, expect, it } from "vitest";
import { HOME_SLUG, pageHref, slugOfHref } from "../src/index";

describe("pageHref / slugOfHref", () => {
  it("puts the home page at / and every other page in its directory", () => {
    expect(pageHref(HOME_SLUG)).toBe("/");
    expect(pageHref("about")).toBe("/about/");
  });

  it("reads a slug back from an internal href, with or without slashes", () => {
    expect(slugOfHref("/")).toBe(HOME_SLUG);
    expect(slugOfHref("")).toBe(HOME_SLUG);
    expect(slugOfHref("/about/")).toBe("about");
    expect(slugOfHref("about")).toBe("about");
  });

  it("round-trips", () => {
    for (const slug of [HOME_SLUG, "about", "team"]) expect(slugOfHref(pageHref(slug))).toBe(slug);
  });
});
