// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateListeners } from "./isolate";

isolateListeners();

const ID = "G-TEST123";

// analytics.ts keeps "already loaded" in module state: fresh module per test.
async function load() {
  vi.resetModules();
  const consent = await import("../src/consent");
  const analytics = await import("../src/analytics");
  return { ...consent, ...analytics };
}

const gtagScripts = () => document.head.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]');

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
  delete window.gtag;
  delete window.dataLayer;
  delete window[`ga-disable-${ID}`];
});

describe("bindAnalyticsToConsent", () => {
  it("loads nothing before consent", async () => {
    const { bindAnalyticsToConsent } = await load();
    bindAnalyticsToConsent(ID);
    expect(window.gtag).toBeUndefined();
    expect(gtagScripts()).toHaveLength(0);
  });

  it("loads gtag.js once consent is granted", async () => {
    const { bindAnalyticsToConsent, saveChoices } = await load();
    bindAnalyticsToConsent(ID);
    saveChoices({ analytics: true });
    expect(gtagScripts()).toHaveLength(1);
    expect((gtagScripts()[0] as HTMLScriptElement).src).toContain(`id=${ID}`);
    expect(window[`ga-disable-${ID}`]).toBe(false);
  });

  it("queues Arguments objects — gtag.js ignores plain arrays", async () => {
    const { bindAnalyticsToConsent, saveChoices } = await load();
    bindAnalyticsToConsent(ID);
    saveChoices({ analytics: true });
    const entries = window.dataLayer as unknown[];
    expect(entries.map((e) => Object.prototype.toString.call(e))).toEqual([
      "[object Arguments]",
      "[object Arguments]",
    ]);
    expect(Array.from(entries[1] as IArguments)).toEqual(["config", ID, { anonymize_ip: true }]);
  });

  it("loads immediately when consent was given on an earlier visit", async () => {
    localStorage.setItem("consent-v1", JSON.stringify({ analytics: true }));
    const { bindAnalyticsToConsent } = await load();
    bindAnalyticsToConsent(ID);
    expect(gtagScripts()).toHaveLength(1);
  });

  it("loads only once across repeated grants", async () => {
    const { bindAnalyticsToConsent, saveChoices } = await load();
    bindAnalyticsToConsent(ID);
    saveChoices({ analytics: true });
    saveChoices({ analytics: false });
    saveChoices({ analytics: true });
    expect(gtagScripts()).toHaveLength(1);
  });

  it("switches GA off through its opt-out flag on revocation", async () => {
    const { bindAnalyticsToConsent, saveChoices } = await load();
    bindAnalyticsToConsent(ID);
    saveChoices({ analytics: true });
    saveChoices({ analytics: false });
    expect(window[`ga-disable-${ID}`]).toBe(true);
  });

  it("does nothing without a measurement id", async () => {
    const { bindAnalyticsToConsent, saveChoices } = await load();
    bindAnalyticsToConsent("");
    saveChoices({ analytics: true });
    expect(window.gtag).toBeUndefined();
  });
});

describe("trackEvent", () => {
  it("is a no-op while GA is not loaded", async () => {
    const { trackEvent } = await load();
    expect(() => trackEvent("signup")).not.toThrow();
  });

  it("sends an event once GA is loaded", async () => {
    const { bindAnalyticsToConsent, saveChoices, trackEvent } = await load();
    bindAnalyticsToConsent(ID);
    saveChoices({ analytics: true });
    trackEvent("signup", { plan: "pro" });
    expect(Array.from((window.dataLayer as IArguments[]).at(-1)!)).toEqual(["event", "signup", { plan: "pro" }]);
  });
});
