import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ThreadsAPI, extractPostId } from "./api";

function mockFetchSequence(responses: Array<Record<string, unknown>>): ReturnType<typeof spyOn> {
  const queue = [...responses];
  const impl = (async () => {
    const body = queue.shift();
    if (!body) throw new Error("mockFetchSequence: ran out of responses");
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return spyOn(globalThis, "fetch").mockImplementation(impl);
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
