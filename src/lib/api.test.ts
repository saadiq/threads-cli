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

describe("ThreadsAPI.getPostMetrics", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("requests and maps shares and clicks", async () => {
    const { calls } = mockFetchSequence([
      {
        data: [
          { name: "views", values: [{ value: 10 }] },
          { name: "likes", values: [{ value: 2 }] },
          { name: "replies", values: [{ value: 1 }] },
          { name: "reposts", values: [{ value: 3 }] },
          { name: "quotes", values: [{ value: 4 }] },
          { name: "shares", values: [{ value: 5 }] },
          { name: "clicks", values: [{ value: 6 }] },
        ],
      },
    ]);
    const api = new ThreadsAPI("t", "u");
    const metrics = await api.getPostMetrics("p1");
    expect(calls[0].url).toContain("metric=views%2Clikes%2Creplies%2Creposts%2Cquotes%2Cshares%2Cclicks");
    expect(metrics).toEqual({
      views: 10,
      likes: 2,
      replies: 1,
      reposts: 3,
      quotes: 4,
      shares: 5,
      clicks: 6,
    });
  });

  test("defaults missing metrics to zero", async () => {
    mockFetchSequence([{ data: [{ name: "views", values: [{ value: 9 }] }] }]);
    const api = new ThreadsAPI("t", "u");
    const metrics = await api.getPostMetrics("p1");
    expect(metrics.views).toBe(9);
    expect(metrics.shares).toBe(0);
    expect(metrics.clicks).toBe(0);
  });
});

describe("ThreadsAPI.getProfile", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("requests name field and maps it", async () => {
    const { calls } = mockFetchSequence([
      {
        id: "u1",
        username: "user",
        name: "Real Name",
        threads_biography: "bio",
        threads_profile_picture_url: "https://pic",
      },
    ]);
    const api = new ThreadsAPI("t", "u1");
    const profile = await api.getProfile();
    expect(calls[0].url).toContain("fields=id%2Cusername%2Cname");
    expect(profile.name).toBe("Real Name");
    expect(profile.username).toBe("user");
  });
});

describe("ThreadsAPI.deletePost", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("issues DELETE to the post id", async () => {
    const { calls } = mockFetchSequence([{ success: true }]);
    const api = new ThreadsAPI("t", "u");
    await api.deletePost("POST123");
    expect(calls[0].url).toContain("/POST123");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  test("resolves URL to id before deleting", async () => {
    const { calls } = mockFetchSequence([{ success: true }]);
    const api = new ThreadsAPI("t", "u");
    await api.deletePost("https://www.threads.net/@user/post/POST123");
    expect(calls[0].url).toContain("/POST123");
    expect(calls[0].url).not.toContain("threads.net%2F");
  });
});
