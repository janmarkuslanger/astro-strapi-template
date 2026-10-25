// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateListeners } from "./isolate";
import { getChoices, getConsent, onConsentChange, resetConsent, saveChoices } from "../src/consent";

isolateListeners();

const KEY = "consent-v1";

beforeEach(() => localStorage.clear());

describe("getChoices", () => {
  it("is null before any decision", () => {
    expect(getChoices()).toBeNull();
  });

  it("returns stored decisions", () => {
    localStorage.setItem(KEY, JSON.stringify({ analytics: true }));
    expect(getChoices()).toEqual({ analytics: true });
  });

  it.each(["not json", "42", "null"])("treats a corrupt value (%s) as no decision", (raw) => {
    localStorage.setItem(KEY, raw);
    expect(getChoices()).toBeNull();
  });
});

describe("getConsent", () => {
  it("is null for a service nobody was asked about", () => {
    saveChoices({ youtube: true });
    expect(getConsent("analytics")).toBeNull();
  });

  it("is true only for an explicit true", () => {
    localStorage.setItem(KEY, JSON.stringify({ a: true, b: false, c: "yes" }));
    expect([getConsent("a"), getConsent("b"), getConsent("c")]).toEqual([true, false, false]);
  });
});

describe("saveChoices", () => {
  it("merges with earlier decisions", () => {
    saveChoices({ analytics: true });
    saveChoices({ youtube: false });
    expect(getChoices()).toEqual({ analytics: true, youtube: false });
  });

  it("still notifies when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const callback = vi.fn();
    onConsentChange("analytics", callback);
    expect(() => saveChoices({ analytics: true })).not.toThrow();
    expect(callback).toHaveBeenCalledWith(true);
  });
});

describe("resetConsent", () => {
  it("clears every decision", () => {
    saveChoices({ analytics: true });
    resetConsent();
    expect(getChoices()).toBeNull();
  });
});

describe("onConsentChange", () => {
  it("fires immediately with an earlier decision", () => {
    saveChoices({ analytics: false });
    const callback = vi.fn();
    onConsentChange("analytics", callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not fire immediately without a decision", () => {
    const callback = vi.fn();
    onConsentChange("analytics", callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("fires on later changes of its own service only", () => {
    const callback = vi.fn();
    onConsentChange("analytics", callback);
    saveChoices({ youtube: true });
    expect(callback).not.toHaveBeenCalled();
    saveChoices({ analytics: true });
    saveChoices({ analytics: false });
    expect(callback.mock.calls).toEqual([[true], [false]]);
  });

  it("does not fire on a reset, which carries no decision", () => {
    saveChoices({ analytics: true });
    const callback = vi.fn();
    onConsentChange("analytics", callback);
    callback.mockClear();
    resetConsent();
    expect(callback).not.toHaveBeenCalled();
  });
});
