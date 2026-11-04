import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrapiCmsAdapter } from "../../src/strapi/index.js";
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

describe("site extensions", () => {
  interface PageExtra {
    subtitle: string;
  }
  interface GlobalExtra {
    phone: string;
  }

  const extended = () =>
    new StrapiCmsAdapter<TestBlock, PageExtra, GlobalExtra>({
      url: URL_BUILD,
      mediaUrl: URL_PUBLIC,
      blocks,
      page: { populate: "populate[hero]=true", map: (raw) => ({ subtitle: raw.subtitle ?? "" }) },
      global: { map: (raw) => ({ phone: raw.phone ?? "" }) },
    });

  beforeEach(() => {
    serve({
      "/api/pages": () => json({ data: [{ slug: "a", title: "A", subtitle: "Sub" }] }),
      "/api/shared-blocks": () => json({ data: [] }),
      "/api/global": () => json({ data: { siteName: "Acme", phone: "123" } }),
    });
  });

  it("populates and maps the site's page fields", async () => {
    const page = await extended().getPage("a");
    expect(page?.subtitle).toBe("Sub");
    expect(requestedUrls()[0]).toContain("populate[hero]=true");
    expect((await extended().listPages())[0].subtitle).toBe("Sub");
  });

  it("maps the site's global fields", async () => {
    expect((await extended().getGlobal()).phone).toBe("123");
  });

  it("requires a mapping once the site declares fields", () => {
    // @ts-expect-error — PageExtra declared, `page` missing
    new StrapiCmsAdapter<TestBlock, PageExtra>({ url: URL_BUILD, blocks });
    // @ts-expect-error — also when every declared field is optional
    new StrapiCmsAdapter<TestBlock, { subtitle?: string }>({ url: URL_BUILD, blocks });
    // No fields declared: no mapping needed.
    new StrapiCmsAdapter<TestBlock>({ url: URL_BUILD, blocks });
  });
});

describe("get and context, for the site's own content types", () => {
  it("sends the token and retries a gateway error", async () => {
    vi.useFakeTimers();
    let calls = 0;
    serve({ "/api/posts": () => (++calls === 1 ? json({}, 502) : json({ data: [{ title: "P" }] })) });
    const result = adapter({ token: "t" }).get("/api/posts");
    await vi.runAllTimersAsync();
    expect((await result).data).toEqual([{ title: "P" }]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { Authorization: "Bearer t" } });
  });

  it("fails with the path on a real error", async () => {
    serve({ "/api/posts": () => json({}, 404) });
    await expect(adapter().get("/api/posts")).rejects.toThrow("404 Error (/api/posts)");
  });

  it("maps media against the public URL", () => {
    expect(adapter({ mediaUrl: URL_PUBLIC }).context.image({ url: "/uploads/p.jpg" })?.src).toBe(
      `${URL_PUBLIC}/uploads/p.jpg`
    );
  });
});

describe("more than one page of entries", () => {
  const entry = (slug: string) => ({ slug, title: slug, blocks: [] });

  it("reads every page of pages and shared blocks", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("/api/shared-blocks")) return json({ data: [], meta: { pagination: { pageCount: 1 } } });
      const page = Number(/pagination\[page\]=(\d+)/.exec(url)?.[1]);
      return json({ data: [entry(`p${page}`)], meta: { pagination: { page, pageCount: 3 } } });
    });
    const pages = await adapter().listPages();
    expect(pages.map((p) => p.slug)).toEqual(["p1", "p2", "p3"]);
    expect(requestedUrls().filter((u) => u.includes("/api/pages")).every((u) => u.includes("pagination[pageSize]=100"))).toBe(true);
  });
});

describe("blocks in a site's own content type", () => {
  beforeEach(() => {
    serve({
      "/api/shared-blocks": () =>
        json({ data: [{ documentId: "s1", blocks: [{ __component: "blocks.text", body: "shared" }] }] }),
    });
  });

  it("maps a dynamic zone with the registered blocks and resolves references", async () => {
    const mapped = await adapter().mapBlocks([
      { __component: "blocks.text", body: "own" },
      { __component: "blocks.reference", block: { documentId: "s1" } },
      { __component: "blocks.unknown" },
    ]);
    expect(mapped.map((b) => (b.type === "text" ? b.html.trim() : b.type))).toEqual(["<p>own</p>", "<p>shared</p>"]);
  });

  it("builds the populate query for the site's zone", () => {
    expect(adapter().populateBlocks("body")).toContain("populate[body][on][blocks.image][populate][image]=true");
  });
});
