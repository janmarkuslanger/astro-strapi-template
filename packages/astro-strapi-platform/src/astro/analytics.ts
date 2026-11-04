/**
 * Google Analytics 4 consumer of the consent system.
 *
 * gtag.js is loaded only once the "analytics" service has been granted. On
 * revocation GA is switched off through its official opt-out flag.
 *
 * NEVER paste a gtag.js snippet into a layout instead of this. A snippet loads
 * on page view — before consent — which defeats the entire system. The loader
 * below is created in code, after the decision. See CLAUDE.md §7.
 *
 * Browser-only.
 */

import { onConsentChange } from "./consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

let loaded = false;

function loadAnalytics(measurementId: string): void {
  if (loaded) return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  // Must push `arguments`, not a rest-parameter array: gtag.js only executes
  // Arguments objects and silently ignores arrays — no config, no hits.
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/**
 * Connects GA to the consent manager (service id "analytics").
 * Idempotent — safe to call once per page.
 */
export function bindAnalyticsToConsent(measurementId: string): void {
  if (!measurementId) return;

  onConsentChange("analytics", (granted) => {
    if (granted) {
      window[`ga-disable-${measurementId}`] = false;
      loadAnalytics(measurementId);
    } else {
      // Official GA opt-out: an already loaded gtag stops sending.
      window[`ga-disable-${measurementId}`] = true;
    }
  });
}

/**
 * Fires a GA4 event — a silent no-op without consent or without GA loaded.
 *
 * Keep the event list short and tied to conversions. Pageviews, scrolls and
 * outbound clicks come from GA4 Enhanced Measurement automatically, as long as
 * the site does full page loads. With a client-side router you must fire
 * `page_view` yourself — see CLAUDE.md §6.
 */
export function trackEvent(
  name: string,
  params: Record<string, string | number> = {}
): void {
  window.gtag?.("event", name, params);
}
