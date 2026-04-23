import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ThreadsAPI, extractPostId } from "./api";

function mockFetchSequence(responses: Array<Record<string, unknown>>): {
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const queue = [...responses];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = queue.shift();
    if (!body) throw new Error("mockFetchSequence: ran out of responses");
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  spyOn(globalThis, "fetch").mockImplementation(impl);
  return { calls };
}

describe("extractPostId", () => {
  test("extracts ID from URL", () => {
    const id = extractPostId("https://www.threads.net/@user/post/ABC123xyz");
    expect(id).toBe("ABC123xyz");
  });

  test("returns raw ID if not a URL", () => {
    const id = extractPostId("ABC123xyz");
    expect(id).toBe("ABC123xyz");
  });

  test("handles threads.net without www", () => {
    const id = extractPostId("https://threads.net/@user/post/ABC123");
    expect(id).toBe("ABC123");
  });
});

describe("ThreadsAPI", () => {
  test("constructs with access token", () => {
    const api = new ThreadsAPI("test-token", "user123");
    expect(api).toBeDefined();
  });
});

describe("ThreadsAPI.waitForContainer", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  const fastOpts = { timeoutMs: 200, intervalMs: 10 };

  test("resolves when status is FINISHED on first poll", async () => {
    mockFetchSequence([{ status: "FINISHED" }]);
    const api = new ThreadsAPI("t", "u") as any;
    await expect(api.waitForContainer("c1", fastOpts)).resolves.toBeUndefined();
  });

  test("resolves when status transitions IN_PROGRESS → FINISHED", async () => {
    mockFetchSequence([{ status: "IN_PROGRESS" }, { status: "FINISHED" }]);
    const api = new ThreadsAPI("t", "u") as any;
    await expect(api.waitForContainer("c1", fastOpts)).resolves.toBeUndefined();
  });

  test("throws with error_message on ERROR", async () => {
    mockFetchSequence([{ status: "ERROR", error_message: "bad media url" }]);
    const api = new ThreadsAPI("t", "u") as any;
    await expect(api.waitForContainer("c1", fastOpts)).rejects.toThrow(
      "Threads container ERROR: bad media url"
    );
  });

  test("throws on EXPIRED with fallback when error_message missing", async () => {
    mockFetchSequence([{ status: "EXPIRED" }]);
    const api = new ThreadsAPI("t", "u") as any;
    await expect(api.waitForContainer("c1", fastOpts)).rejects.toThrow(
      "Threads container EXPIRED: no error message"
    );
  });

  test("throws with elapsed and configured timeout on deadline", async () => {
    mockFetchSequence([
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
    ]);
    const api = new ThreadsAPI("t", "u") as any;
    await expect(
      api.waitForContainer("c1", { timeoutMs: 50, intervalMs: 20 })
    ).rejects.toThrow(/not ready after \d+ms \(timeout 50ms, status=IN_PROGRESS\)/);
  });
});

describe("ThreadsAPI.createImagePost", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("sends alt_text when provided", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    const id = await api.createImagePost("hello", "https://example.com/x.png", undefined, "my alt");
    expect(id).toBe("post1");
    const createBody = (calls[0].init?.body as URLSearchParams).toString();
    expect(createBody).toContain("alt_text=my+alt");
  });

  test("omits alt_text when not provided", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createImagePost("hello", "https://example.com/x.png");
    const createBody = (calls[0].init?.body as URLSearchParams).toString();
    expect(createBody).not.toContain("alt_text");
  });

  test("forwards both reply_to_id and alt_text", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createImagePost("hello", "https://example.com/x.png", "parent123", "alt");
    const createBody = (calls[0].init?.body as URLSearchParams).toString();
    expect(createBody).toContain("reply_to_id=parent123");
    expect(createBody).toContain("alt_text=alt");
  });
});
