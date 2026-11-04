import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrapiCmsAdapter } from "../src/index.js";
import { blocks, type TestBlock } from "./fixtures.js";

const URL_BUILD = "http://127.0.0.1:1337";
const URL_PUBLIC = "https://cms.acme.test";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Error" });

const fetchMock = vi.fn<typeof fetch>();

/** Routes by path prefix; each route returns a fresh Response. */
function serve(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    const match = Object.keys(routes).find((prefix) => url.startsWith(`${URL_BUILD}${prefix}`));
    if (!match) throw new Error(`unexpected request: ${url}`);
    return routes[match]();
  });
}

const adapter = (options: { token?: string; mediaUrl?: string } = {}) =>
  new StrapiCmsAdapter<TestBlock>({ url: URL_BUILD, blocks, ...options });

const requestedUrls = () => fetchMock.mock.calls.map(([input]) => decodeURIComponent(String(input)));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPage", () => {
  const pageEntry = {
    slug: "a b",
    title: "A",
    seo: { title: "A", description: "" },
    blocks: [
      { __component: "blocks.image", image: { url: "/uploads/x.jpg" } },
      { __component: "blocks.reference", block: { documentId: "s1" } },
    ],
  };

  beforeEach(() => {
    serve({
      "/api/pages": () => json({ data: [pageEntry] }),
      "/api/shared-blocks": () =>
        json({ data: [{ documentId: "s1", blocks: [{ __component: "blocks.text", body: "shared" }] }] }),
    });
  });

  it("filters by the encoded slug and populates seo and every block", async () => {
    await adapter().getPage("a b");
    const [pageUrl] = fetchMock.mock.calls.map(([input]) => String(input));
    expect(pageUrl).toContain("filters[slug][$eq]=a%20b");
    expect(decodeURIComponent(pageUrl)).toContain("populate[seo]=true");
    expect(pageUrl).toContain("populate[blocks][on][blocks.image][populate][image]=true");
    expect(pageUrl).toContain("populate[blocks][on][blocks.reference][populate]=block");
  });

  it("resolves references into the shared block's blocks", async () => {
    const page = await adapter().getPage("a b");
    expect(page?.blocks.map((b) => b.type)).toEqual(["image", "text"]);
  });

  it("writes the public media URL into image sources", async () => {
    const page = await adapter({ mediaUrl: URL_PUBLIC }).getPage("a b");
    expect(page?.blocks[0]).toMatchObject({ image: { src: `${URL_PUBLIC}/uploads/x.jpg` } });
  });

  it("falls back to the fetch URL when no media URL is given", async () => {
    const page = await adapter({ mediaUrl: "" }).getPage("a b");
    expect(page?.blocks[0]).toMatchObject({ image: { src: `${URL_BUILD}/uploads/x.jpg` } });
  });

  it("returns null for an unknown slug", async () => {
    serve({ "/api/pages": () => json({ data: [] }) });
    expect(await adapter().getPage("missing")).toBeNull();
  });

  it("fetches shared blocks once per adapter", async () => {
    const cms = adapter();
    await cms.getPage("a b");
    await cms.getPage("a b");
    await cms.listPages();
    expect(requestedUrls().filter((u) => u.includes("/api/shared-blocks"))).toHaveLength(1);
  });
});

describe("listPages", () => {
  it("maps every entry and resolves references to unknown shared blocks to nothing", async () => {
    serve({
      "/api/pages": () =>
        json({
          data: [
            { slug: "home", blocks: [{ __component: "blocks.reference", block: { documentId: "gone" } }] },
            { slug: "about", blocks: [] },
          ],
        }),
      "/api/shared-blocks": () => json({ data: [] }),
    });
    const pages = await adapter().listPages();
    expect(pages.map((p) => [p.slug, p.blocks.length])).toEqual([["home", 0], ["about", 0]]);
  });
});

describe("getGlobal", () => {
  it("populates navigation and footer links", async () => {
    serve({ "/api/global": () => json({ data: { siteName: "Acme", navigation: [], footerLinks: [] } }) });
    const global = await adapter().getGlobal();
    expect(global.siteName).toBe("Acme");
    expect(requestedUrls()[0]).toContain("populate[navigation]=true&populate[footerLinks]=true");
  });
});

describe("authentication", () => {
  beforeEach(() => serve({ "/api/global": () => json({ data: {} }) }));

  it("sends a bearer token when configured", async () => {
    await adapter({ token: "secret" }).getGlobal();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer secret" });
  });

  it("sends no Authorization header without a token", async () => {
    await adapter().getGlobal();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });
});

describe("retries", () => {
  beforeEach(() => vi.useFakeTimers());

  it.each([502, 503, 504])("retries a %i and succeeds", async (status) => {
    fetchMock
      .mockResolvedValueOnce(json({}, status))
      .mockResolvedValueOnce(json({ data: { siteName: "Acme" } }));
    const result = adapter().getGlobal();
    await vi.runAllTimersAsync();
    expect((await result).siteName).toBe("Acme");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries connection failures with a growing backoff", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({ data: {} }));
    const result = adapter().getGlobal();
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after four attempts and rethrows the connection error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = adapter().getGlobal();
    const assertion = expect(result).rejects.toThrow("fetch failed");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails after four gateway errors with the status in the message", async () => {
    fetchMock.mockImplementation(async () => json({}, 503));
    const result = adapter().getGlobal();
    const assertion = expect(result).rejects.toThrow("Strapi request failed: 503");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([400, 401, 403, 404, 500])("fails a %i immediately, naming the path", async (status) => {
    fetchMock.mockImplementation(async () => json({}, status));
    await expect(adapter().getGlobal()).rejects.toThrow(new RegExp(`${status} .*\\(/api/global\\?`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
