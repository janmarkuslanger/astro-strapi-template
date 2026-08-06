/**
 * Registry of every service that requires consent.
 *
 * The banner renders itself from this list. An empty list renders nothing at
 * all — which is exactly what you want on a site with no third-party services,
 * and a thing to remember when debugging "why is there no banner": no
 * registered service means no banner, by design.
 *
 * Adding one (e.g. YouTube embeds):
 *  1. Add an entry here.
 *  2. Wire the consumer — `onConsentChange("<id>", …)` in a script, or
 *     declaratively with `<ConsentGate service="<id>">…</ConsentGate>`.
 *  3. Add a section to the privacy policy.
 * Banner, storage and revocation adapt automatically.
 *
 * Labels and descriptions are shown to visitors, so they stay in the
 * audience's language (CLAUDE.md §0).
 */

export interface ConsentService {
  id: string;
  label: string;
  description: string;
}

// Analytics registers only when an id is configured. Production takes it from
// the committed apps/web/.env.production; locally it is normally unset, so
// development produces no tracking and no banner. See CLAUDE.md §3.
const GA_ID = import.meta.env.PUBLIC_GA_MEASUREMENT_ID;

export const CONSENT_SERVICES: ConsentService[] = [
  ...(GA_ID
    ? [
        {
          id: "analytics",
          label: "Statistics (Google Analytics)",
          description:
            "Helps understand how the site is used — anonymised, no advertising.",
        },
      ]
    : []),
  // Example for later:
  // {
  //   id: "youtube",
  //   label: "YouTube videos",
  //   description: "Embedded videos load data from YouTube/Google.",
  // },
];
