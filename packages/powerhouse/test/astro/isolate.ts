import { afterEach, beforeEach } from "vitest";

/**
 * In a browser every page load starts with fresh modules and a fresh window.
 * In one jsdom, listeners from earlier tests would keep reacting, so every
 * listener added during a test is removed after it.
 */
export function isolateListeners(): void {
  const added: [EventTarget, string, EventListenerOrEventListenerObject | null][] = [];
  const originals = new Map<EventTarget, EventTarget["addEventListener"]>();

  beforeEach(() => {
    for (const target of [window, document] as EventTarget[]) {
      const original = target.addEventListener.bind(target);
      originals.set(target, target.addEventListener);
      target.addEventListener = (type, listener, options) => {
        added.push([target, type, listener]);
        original(type, listener, options);
      };
    }
  });

  afterEach(() => {
    for (const [target, type, listener] of added.splice(0)) target.removeEventListener(type, listener);
    for (const [target, original] of originals) target.addEventListener = original;
    originals.clear();
  });
}
