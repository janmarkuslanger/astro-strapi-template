// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateListeners } from "./isolate";

isolateListeners();

// Fresh modules per test, as on a page load.
async function load() {
  vi.resetModules();
  return { ...(await import("../src/consent")), ...(await import("../src/consent-ui")) };
}

const BANNER = `
  <div id="banner" class="hidden">
    <input type="checkbox" name="consent-service" value="analytics" />
    <input type="checkbox" name="consent-service" value="youtube" />
    <button data-consent-accept-all></button>
    <button data-consent-decline></button>
    <button data-consent-save></button>
  </div>
  <button data-consent-settings></button>`;

const GATE = `
  <div data-consent-gate="youtube">
    <div data-consent-placeholder><button data-consent-allow></button></div>
    <template data-consent-content><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe></template>
  </div>`;

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const click = (selector: string) => $(selector).click();
const hidden = () => $("#banner").classList.contains("hidden");
const box = (id: string) => $<HTMLInputElement>(`input[value="${id}"]`);
const SERVICES = ["analytics", "youtube"];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("initConsentBanner", () => {
  beforeEach(() => {
    document.body.innerHTML = BANNER;
  });

  it("shows the banner while no decision exists", async () => {
    const { initConsentBanner } = await load();
    initConsentBanner($("#banner"), SERVICES);
    expect(hidden()).toBe(false);
  });

  it("stays hidden when every service is decided", async () => {
    localStorage.setItem("consent-v1", JSON.stringify({ analytics: false, youtube: true }));
    const { initConsentBanner } = await load();
    initConsentBanner($("#banner"), SERVICES);
    expect(hidden()).toBe(true);
  });

  it("asks again when a service was added since the last decision", async () => {
    localStorage.setItem("consent-v1", JSON.stringify({ analytics: true }));
    const { initConsentBanner } = await load();
    initConsentBanner($("#banner"), SERVICES);
    expect(hidden()).toBe(false);
    expect(box("analytics").checked).toBe(true);
    expect(box("youtube").checked).toBe(false);
  });

  it("accept all grants every service and hides the banner", async () => {
    const { initConsentBanner, getChoices } = await load();
    initConsentBanner($("#banner"), SERVICES);
    click("[data-consent-accept-all]");
    expect(getChoices()).toEqual({ analytics: true, youtube: true });
    expect(hidden()).toBe(true);
  });

  it("decline refuses every service and hides the banner", async () => {
    const { initConsentBanner, getChoices } = await load();
    initConsentBanner($("#banner"), SERVICES);
    click("[data-consent-decline]");
    expect(getChoices()).toEqual({ analytics: false, youtube: false });
    expect(hidden()).toBe(true);
  });

  it("save stores exactly the checked services", async () => {
    const { initConsentBanner, getChoices } = await load();
    initConsentBanner($("#banner"), SERVICES);
    box("youtube").checked = true;
    click("[data-consent-save]");
    expect(getChoices()).toEqual({ analytics: false, youtube: true });
  });

  it("cookie settings clear the decision and reopen the banner", async () => {
    const { initConsentBanner, getChoices } = await load();
    initConsentBanner($("#banner"), SERVICES);
    click("[data-consent-accept-all]");
    click("[data-consent-settings]");
    expect(getChoices()).toBeNull();
    expect(hidden()).toBe(false);
    expect(box("analytics").checked).toBe(false);
  });

  it("supports a custom hidden class", async () => {
    $("#banner").className = "is-hidden";
    const { initConsentBanner } = await load();
    initConsentBanner($("#banner"), SERVICES, { hiddenClass: "is-hidden" });
    click("[data-consent-decline]");
    expect($("#banner").classList.contains("is-hidden")).toBe(true);
  });
});

describe("initConsentGates", () => {
  beforeEach(() => {
    document.body.innerHTML = GATE;
  });

  const iframes = () => document.querySelectorAll("[data-consent-gate] > iframe");

  it("keeps the embed out of the DOM before consent", async () => {
    const { initConsentGates } = await load();
    initConsentGates();
    expect(iframes()).toHaveLength(0);
    expect($("[data-consent-placeholder]")).not.toBeNull();
  });

  it("reveals the embed on the gate's own button and remembers it", async () => {
    const { initConsentGates, getConsent } = await load();
    initConsentGates();
    click("[data-consent-allow]");
    expect(iframes()).toHaveLength(1);
    expect(document.querySelector("[data-consent-placeholder]")).toBeNull();
    expect(getConsent("youtube")).toBe(true);
  });

  it("reveals the embed when consent is granted through the banner", async () => {
    const { initConsentGates, saveChoices } = await load();
    initConsentGates();
    saveChoices({ youtube: true });
    expect(iframes()).toHaveLength(1);
  });

  it("reveals immediately with consent from an earlier visit", async () => {
    localStorage.setItem("consent-v1", JSON.stringify({ youtube: true }));
    const { initConsentGates } = await load();
    initConsentGates();
    expect(iframes()).toHaveLength(1);
  });

  it("reveals only once", async () => {
    const { initConsentGates, saveChoices } = await load();
    initConsentGates();
    saveChoices({ youtube: true });
    saveChoices({ youtube: true });
    expect(iframes()).toHaveLength(1);
  });

  it("ignores consent for other services", async () => {
    const { initConsentGates, saveChoices } = await load();
    initConsentGates();
    saveChoices({ analytics: true });
    expect(iframes()).toHaveLength(0);
  });
});

describe("trackMailtoClicks", () => {
  it("sends mailto_click with the page path", async () => {
    document.body.innerHTML = `<a href="mailto:hi@acme.test"><span id="inner">mail</span></a><a id="other" href="/x">x</a>`;
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackMailtoClicks } = await load();
    trackMailtoClicks();

    $("#inner").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    $("#other").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "mailto_click", { page_path: location.pathname });
    delete window.gtag;
  });
});
