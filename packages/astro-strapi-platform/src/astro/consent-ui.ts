/**
 * Behaviour of the consent banner and embed gates. Markup, styling and copy
 * belong to the site (they are design, and in the audience's language); this
 * module only wires them up through data attributes:
 *
 *   banner  input[name="consent-service"][value=<id>]   one per service
 *           [data-consent-accept-all] [data-consent-decline] [data-consent-save]
 *   page    [data-consent-settings]                     reopens the banner
 *   gate    [data-consent-gate=<id>] containing
 *           [data-consent-placeholder] [data-consent-allow]
 *           <template data-consent-content>             revealed after consent
 *
 * "Accept all" and "Decline" must carry equal visual weight in the markup —
 * no dark patterns (CLAUDE.md §7).
 *
 * Browser-only.
 */
import { getChoices, onConsentChange, resetConsent, saveChoices } from "./consent";
import { trackEvent } from "./analytics";

export interface ConsentBannerOptions {
  /** Class that hides the banner. Default: "hidden". */
  hiddenClass?: string;
}

/** Wires a banner element for the given service ids. */
export function initConsentBanner(
  banner: HTMLElement,
  serviceIds: string[],
  { hiddenClass = "hidden" }: ConsentBannerOptions = {}
): void {
  const boxes = () =>
    Array.from(
      banner.querySelectorAll<HTMLInputElement>('input[name="consent-service"]')
    );

  const show = () => {
    const stored = getChoices() ?? {};
    for (const box of boxes()) box.checked = stored[box.value] === true;
    banner.classList.remove(hiddenClass);
  };
  const hide = () => banner.classList.add(hiddenClass);

  const decide = (value: (id: string) => boolean) => {
    saveChoices(Object.fromEntries(serviceIds.map((id) => [id, value(id)])));
    hide();
  };

  // Ask only while at least one registered service has no decision yet.
  const stored = getChoices();
  const undecided = serviceIds.some((id) => !stored || !(id in stored));
  if (undecided) show();

  banner
    .querySelector("[data-consent-accept-all]")
    ?.addEventListener("click", () => decide(() => true));

  banner
    .querySelector("[data-consent-decline]")
    ?.addEventListener("click", () => decide(() => false));

  banner.querySelector("[data-consent-save]")?.addEventListener("click", () => {
    const checked = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
    decide((id) => checked.has(id));
  });

  // "Cookie settings": clear decisions and ask again.
  document.querySelectorAll("[data-consent-settings]").forEach((el) =>
    el.addEventListener("click", () => {
      resetConsent();
      show();
    })
  );
}

/**
 * Two-click gates for third-party embeds. The slot content sits in a
 * <template> and enters the DOM only after consent — a hidden iframe would
 * still load.
 */
export function initConsentGates(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-consent-gate]").forEach((gate) => {
    const service = gate.dataset.consentGate!;
    const placeholder = gate.querySelector<HTMLElement>("[data-consent-placeholder]");
    const template = gate.querySelector<HTMLTemplateElement>("[data-consent-content]");

    const reveal = () => {
      if (!template || gate.dataset.revealed === "true") return;
      gate.dataset.revealed = "true";
      placeholder?.remove();
      gate.appendChild(template.content.cloneNode(true));
    };

    onConsentChange(service, (granted) => granted && reveal());

    gate.querySelector("[data-consent-allow]")?.addEventListener("click", () => {
      saveChoices({ [service]: true });
    });
  });
}

/** Email clicks are a conversion path worth measuring. A no-op without consent. */
export function trackMailtoClicks(): void {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.('a[href^="mailto:"]');
    if (link) trackEvent("mailto_click", { page_path: location.pathname });
  });
}
