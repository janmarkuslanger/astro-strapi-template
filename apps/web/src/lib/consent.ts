/**
 * Generic consent manager (GDPR opt-in).
 *
 * Services are registered in `consent-services.ts`; this store only keeps
 * decisions and notifies consumers. It knows nothing about Google Analytics
 * & co., which is what makes it reusable for any service (analytics, embeds,
 * maps, …).
 *
 * Browser-only.
 */

// Change PROJECT to the project slug. Bump the suffix if the stored shape ever
// changes — an old value must never be read as a new one.
const STORAGE_KEY = "PROJECT-consent-v1";
const EVENT_NAME = "PROJECT:consent-changed";

/** serviceId → granted? */
export type ConsentChoices = Record<string, boolean>;

/** All stored decisions — null when nothing has been decided yet. */
export function getChoices(): ConsentChoices | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Decision for a single service — null means "not asked yet". */
export function getConsent(serviceId: string): boolean | null {
  const choices = getChoices();
  if (!choices || !(serviceId in choices)) return null;
  return choices[serviceId] === true;
}

/** Stores decisions (merged with existing ones) and notifies every consumer. */
export function saveChoices(update: ConsentChoices): void {
  const merged = { ...(getChoices() ?? {}), ...update };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Storage unavailable (private mode, quota) — the decision then holds for
    // this page view only. Better than throwing in the middle of a click.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: merged }));
}

/** Clears all decisions — used by the footer "cookie settings" link. */
export function resetConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: {} }));
}

/**
 * Subscribes to changes for one service. The callback fires immediately with
 * the current state (if already decided) and on every change afterwards — so
 * consumers never need to care whether consent was stored earlier or granted
 * just now.
 */
export function onConsentChange(
  serviceId: string,
  callback: (granted: boolean) => void
): void {
  const current = getConsent(serviceId);
  if (current !== null) callback(current);

  window.addEventListener(EVENT_NAME, (event) => {
    const choices = (event as CustomEvent<ConsentChoices>).detail;
    if (serviceId in choices) callback(choices[serviceId] === true);
  });
}
