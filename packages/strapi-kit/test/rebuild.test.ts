import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStrapi } from "./fake-strapi";

// Spawning a process is the I/O boundary of strategy "script".
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));

const { registerRebuildTrigger } = await import("../src/index");

const PAGE = "api::page.page"; // draft & publish
const GLOBAL = "api::global.global"; // no draft & publish
const FORM = "api::contact.contact"; // visitor-created, never watched
const contentTypes = { [PAGE]: true, [GLOBAL]: false, [FORM]: false };

const fetchMock = vi.fn<typeof fetch>();
let tmp: string;

function production(env: Record<string, string>) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("REBUILD_DELAY_MS", "1000");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

function child(exitCode: number) {
  const proc = Object.assign(new EventEmitter(), { unref: vi.fn() });
  queueMicrotask(() => proc.emit("exit", exitCode));
  return proc;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  spawn.mockReset();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rebuild-"));
  for (const key of ["REBUILD_ENABLED", "REBUILD_STRATEGY", "REBUILD_HOOK_URL", "REBUILD_SCRIPT", "REBUILD_LOG"]) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("activation", () => {
  it("is inactive without a strategy", () => {
    production({});
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });
    expect(fake.subscribed()).toEqual([]);
    expect(fake.log.info).toHaveBeenCalledWith(expect.stringContaining("inactive (strategy=none"));
  });

  it("is off in development unless REBUILD_ENABLED=true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REBUILD_STRATEGY", "hook");
    vi.stubEnv("REBUILD_HOOK_URL", "https://hook.test");
    const off = fakeStrapi({ contentTypes });
    registerRebuildTrigger(off.strapi, { watched: [PAGE] });
    expect(off.subscribed()).toEqual([]);

    vi.stubEnv("REBUILD_ENABLED", "true");
    const on = fakeStrapi({ contentTypes });
    registerRebuildTrigger(on.strapi, { watched: [PAGE] });
    expect(on.subscribed()).not.toEqual([]);
  });

  it("can be switched off in production with REBUILD_ENABLED=false", () => {
    production({ REBUILD_ENABLED: "false", REBUILD_STRATEGY: "hook", REBUILD_HOOK_URL: "https://hook.test" });
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });
    expect(fake.subscribed()).toEqual([]);
  });

  it("warns and stays inactive when the hook URL is missing", () => {
    production({ REBUILD_STRATEGY: "hook" });
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });
    expect(fake.subscribed()).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining("REBUILD_HOOK_URL is empty"));
  });

  it("warns and stays inactive when the script does not exist", () => {
    production({ REBUILD_STRATEGY: "script", REBUILD_SCRIPT: path.join(tmp, "nope.sh") });
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });
    expect(fake.subscribed()).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining("script not found"));
  });
});

describe("which events count", () => {
  beforeEach(() => production({ REBUILD_STRATEGY: "hook", REBUILD_HOOK_URL: "https://hook.test" }));

  it("listens to publish events for draft & publish types", () => {
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });
    expect(fake.subscribed()).toEqual(["entry.delete", "entry.publish", "entry.unpublish"]);
  });

  it("listens to plain writes for types without draft & publish", () => {
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [GLOBAL] });
    expect(fake.subscribed()).toEqual(["entry.create", "entry.delete", "entry.update"]);
  });

  it("skips watched types that do not exist yet", () => {
    const fake = fakeStrapi({ contentTypes });
    expect(() => registerRebuildTrigger(fake.strapi, { watched: ["api::later.later", PAGE] })).not.toThrow();
    expect(fake.subscribed()).toEqual(["entry.delete", "entry.publish", "entry.unpublish"]);
  });

  it("ignores events of types that are not watched", async () => {
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [GLOBAL] });
    await fake.emit("entry.create", { uid: FORM });
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("strategy hook", () => {
  beforeEach(() => production({ REBUILD_STRATEGY: "hook", REBUILD_HOOK_URL: "https://hook.test" }));

  it("collapses a burst into one POST after the quiet period", async () => {
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE, GLOBAL] });

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.advanceTimersByTimeAsync(900);
    await fake.emit("entry.update", { uid: GLOBAL });
    await vi.advanceTimersByTimeAsync(900);
    expect(fetchMock).not.toHaveBeenCalled(); // timer restarted by the second event

    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://hook.test", { method: "POST" });
    expect(fake.log.info).toHaveBeenCalledWith("Rebuild: starting (2 changes).");
  });

  it("logs a failing hook instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 })).mockRejectedValueOnce(new Error("offline"));
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.runAllTimersAsync();
    expect(fake.log.warn).toHaveBeenCalledWith("Rebuild: hook returned 500.");

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.runAllTimersAsync();
    expect(fake.log.error).toHaveBeenCalledWith(expect.stringContaining("offline"));
  });
});

describe("strategy script", () => {
  let script: string;
  let logFile: string;

  beforeEach(() => {
    script = path.join(tmp, "rebuild.sh");
    logFile = path.join(tmp, "logs", "rebuild.log");
    fs.writeFileSync(script, "exit 0\n");
    production({ REBUILD_STRATEGY: "script", REBUILD_SCRIPT: script, REBUILD_LOG: logFile });
  });

  it("runs the script detached, logging to the log file", async () => {
    spawn.mockImplementation(() => child(0));
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.runAllTimersAsync();

    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0];
    expect([cmd, args]).toEqual(["bash", [script]]);
    expect(opts.detached).toBe(true);
    expect(typeof opts.stdio[1]).toBe("number"); // file descriptor of the log
    expect(fs.existsSync(logFile)).toBe(true);
    expect(fake.log.info).toHaveBeenCalledWith("Rebuild: site republished.");
  });

  it("closes its copy of the log descriptor once the child has it", async () => {
    spawn.mockImplementation(() => child(0));
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.runAllTimersAsync();
    const fd: number = spawn.mock.calls[0][2].stdio[1];
    expect(() => fs.fstatSync(fd)).toThrow(/EBADF/);
  });

  it("reports a failing script with its exit code", async () => {
    spawn.mockImplementation(() => child(3));
    const fake = fakeStrapi({ contentTypes });
    registerRebuildTrigger(fake.strapi, { watched: [PAGE] });

    await fake.emit("entry.publish", { uid: PAGE });
    await vi.runAllTimersAsync();
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining("script exited with 3"));
  });
});
