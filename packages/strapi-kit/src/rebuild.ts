import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Core } from "@strapi/strapi";

/**
 * Triggers a rebuild of the static frontend when content changes.
 *
 * The site is static, so a publish is invisible until something rebuilds. This
 * module decides *when*; HOW is a deployment detail and therefore a strategy:
 *
 *   hook     POST to a URL (Vercel/Netlify/Cloudflare deploy hook, or a CI
 *            repository_dispatch endpoint). Works from anywhere.
 *   script   run a local build script — only when the CMS and the site share a
 *            machine. Fastest, no token, works when the internet doesn't. The
 *            script is YOURS to write (the template ships none, because what it
 *            does depends on the host); docs/deployment-targets.md describes
 *            what it has to get right. Point REBUILD_SCRIPT at it.
 *   none     rebuilds are handled elsewhere (or the site isn't live yet).
 *
 * Three decisions worth knowing:
 *
 * - **Which events count.** Content types with draft & publish only react to
 *   publish/unpublish/delete — reacting to every save would rebuild the site
 *   for a draft nobody should see yet. Types without draft & publish (global
 *   settings, categories) have no publish step, so a plain update IS the
 *   change.
 * - **Which content types count.** Form submissions are content too, but a
 *   visitor sending a message must never trigger a build.
 * - **Bursts collapse.** Events are collected for a few seconds, so publishing
 *   five pages costs one build instead of five.
 *
 * Configuration (all optional):
 *   REBUILD_STRATEGY   "hook" | "script" | "none"  (default: none)
 *   REBUILD_ENABLED    "false" disables entirely; in development it is off
 *                      unless set to "true"
 *   REBUILD_HOOK_URL   strategy=hook: the URL to POST to
 *   REBUILD_SCRIPT     strategy=script: path to your build script (required —
 *                      the default path is a convention, not a shipped file)
 *   REBUILD_DELAY_MS   collection window (default 20000)
 *   REBUILD_LOG        strategy=script: log file for build output
 */

export interface RebuildOptions {
  /**
   * Content types whose changes are visible on the site. Deliberately NOT
   * here: form submissions — a visitor sending a message must not cause a
   * deploy.
   */
  watched: string[];
}

const PUBLISH_EVENTS = ["entry.publish", "entry.unpublish", "entry.delete"];
const DIRECT_EVENTS = ["entry.create", "entry.update", "entry.delete"];

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

function resolveConfig() {
  const enabled =
    process.env.REBUILD_ENABLED === "true" ||
    (process.env.REBUILD_ENABLED !== "false" &&
      process.env.NODE_ENV === "production");

  return {
    enabled,
    strategy: (process.env.REBUILD_STRATEGY ?? "none") as
      | "hook"
      | "script"
      | "none",
    hookUrl: process.env.REBUILD_HOOK_URL ?? "",
    script:
      process.env.REBUILD_SCRIPT ??
      path.join(REPO_ROOT, "deploy", "rebuild-web.sh"),
    delay: Number(process.env.REBUILD_DELAY_MS ?? 20_000),
    logFile:
      process.env.REBUILD_LOG ??
      path.resolve(REPO_ROOT, "..", "shared", "rebuild.log"),
  };
}

export function registerRebuildTrigger(
  strapi: Core.Strapi,
  options: RebuildOptions
): void {
  const cfg = resolveConfig();

  if (!cfg.enabled || cfg.strategy === "none") {
    strapi.log.info(
      `Rebuild: inactive (strategy=${cfg.strategy}, enabled=${cfg.enabled}).`
    );
    return;
  }

  if (cfg.strategy === "hook" && !cfg.hookUrl) {
    strapi.log.warn("Rebuild: strategy=hook but REBUILD_HOOK_URL is empty.");
    return;
  }

  if (cfg.strategy === "script" && !fs.existsSync(cfg.script)) {
    strapi.log.warn(
      `Rebuild: script not found (${cfg.script}) — content changes will only ` +
        "appear with the next deploy."
    );
    return;
  }

  let timer: NodeJS.Timeout | null = null;
  let pending = 0;

  const runHook = async () => {
    try {
      const res = await fetch(cfg.hookUrl, { method: "POST" });
      if (res.ok) strapi.log.info("Rebuild: hook triggered.");
      else strapi.log.warn(`Rebuild: hook returned ${res.status}.`);
    } catch (error) {
      strapi.log.error(`Rebuild: hook failed: ${error}`);
    }
  };

  const runScript = () => {
    let out: number | "ignore" = "ignore";
    try {
      fs.mkdirSync(path.dirname(cfg.logFile), { recursive: true });
      out = fs.openSync(cfg.logFile, "a");
    } catch (error) {
      strapi.log.warn(`Rebuild: log file not writable (${error}).`);
    }

    // Detached: the build outlives this request and must not keep Strapi
    // waiting. A failed build leaves the published site untouched.
    const child = spawn("bash", [cfg.script], {
      detached: true,
      stdio: ["ignore", out, out],
    });

    child.on("error", (error) =>
      strapi.log.error(`Rebuild: could not start script: ${error}`)
    );
    child.on("exit", (code) => {
      if (code === 0) strapi.log.info("Rebuild: site republished.");
      else strapi.log.warn(`Rebuild: script exited with ${code} — see ${cfg.logFile}.`);
    });

    child.unref();
  };

  const run = () => {
    const count = pending;
    timer = null;
    pending = 0;
    strapi.log.info(`Rebuild: starting (${count} change${count === 1 ? "" : "s"}).`);
    if (cfg.strategy === "hook") void runHook();
    else runScript();
  };

  const schedule = (event: string, uid: string) => {
    pending += 1;
    strapi.log.debug(`Rebuild: queued ${event} on ${uid}.`);
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, cfg.delay);
    timer.unref?.();
  };

  for (const uid of options.watched) {
    let contentType: any;
    try {
      contentType = strapi.contentType(uid as any);
    } catch {
      // A content type that doesn't exist yet is not an error — the list above
      // may run ahead of a deploy.
      continue;
    }

    const events = contentType?.options?.draftAndPublish
      ? PUBLISH_EVENTS
      : DIRECT_EVENTS;

    for (const event of events) {
      strapi.eventHub.on(event, async (payload: any) => {
        if (payload?.uid === uid) schedule(event, uid);
      });
    }
  }

  strapi.log.info(
    `Rebuild: active (strategy=${cfg.strategy}, debounce ${Math.round(cfg.delay / 1000)}s).`
  );
}
