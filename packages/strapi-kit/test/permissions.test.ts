import { describe, expect, it } from "vitest";
import { setPublicPermissions } from "../src/index";
import { fakeStrapi } from "./fake-strapi";

describe("setPublicPermissions", () => {
  it("grants every missing action to the public role", async () => {
    const fake = fakeStrapi();
    await setPublicPermissions(fake.strapi, ["api::page.page.find", "api::page.page.findOne"]);
    expect(fake.permissionsCreated).toEqual(["api::page.page.find@42", "api::page.page.findOne@42"]);
  });

  it("is idempotent: existing permissions are not created again", async () => {
    const fake = fakeStrapi({ permissions: ["api::page.page.find"] });
    await setPublicPermissions(fake.strapi, ["api::page.page.find", "api::global.global.find"]);
    expect(fake.permissionsCreated).toEqual(["api::global.global.find@42"]);
  });

  it("does nothing without a public role", async () => {
    const fake = fakeStrapi({ publicRole: false });
    await setPublicPermissions(fake.strapi, ["api::page.page.find"]);
    expect(fake.permissionsCreated).toEqual([]);
  });
});
