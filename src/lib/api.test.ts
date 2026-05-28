import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ThreadsAPI, extractPostId, detectMediaType } from "./api";
import { waitForContainer } from "./api-publish";

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
    const api = new ThreadsAPI("t", "u");
    await expect(waitForContainer(api, "c1", fastOpts)).resolves.toBeUndefined();
  });

  test("resolves when status transitions IN_PROGRESS → FINISHED", async () => {
    mockFetchSequence([{ status: "IN_PROGRESS" }, { status: "FINISHED" }]);
    const api = new ThreadsAPI("t", "u");
    await expect(waitForContainer(api, "c1", fastOpts)).resolves.toBeUndefined();
  });

  test("throws with error_message on ERROR", async () => {
    mockFetchSequence([{ status: "ERROR", error_message: "bad media url" }]);
    const api = new ThreadsAPI("t", "u");
    await expect(waitForContainer(api, "c1", fastOpts)).rejects.toThrow(
      "Threads container ERROR: bad media url"
    );
  });

  test("throws on EXPIRED with fallback when error_message missing", async () => {
    mockFetchSequence([{ status: "EXPIRED" }]);
    const api = new ThreadsAPI("t", "u");
    await expect(waitForContainer(api, "c1", fastOpts)).rejects.toThrow(
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
    const api = new ThreadsAPI("t", "u");
    await expect(
      waitForContainer(api, "c1", { timeoutMs: 50, intervalMs: 20 })
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

describe("detectMediaType", () => {
  test("detects video extensions", () => {
    expect(detectMediaType("https://e/clip.mp4")).toBe("VIDEO");
    expect(detectMediaType("https://e/clip.MOV")).toBe("VIDEO");
    expect(detectMediaType("https://e/clip.m4v?token=1")).toBe("VIDEO");
    expect(detectMediaType("https://cdn/clip.mp4/transcode?sig=x")).toBe("VIDEO");
  });

  test("defaults to image", () => {
    expect(detectMediaType("https://e/pic.png")).toBe("IMAGE");
    expect(detectMediaType("https://e/pic.jpg")).toBe("IMAGE");
    expect(detectMediaType("https://e/no-extension")).toBe("IMAGE");
  });
});

describe("ThreadsAPI.createVideoPost", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("sends media_type=VIDEO and video_url", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    const id = await api.createVideoPost("hi", "https://example.com/clip.mp4", undefined, "a clip");
    expect(id).toBe("post1");
    const body = (calls[0].init?.body as URLSearchParams).toString();
    expect(body).toContain("media_type=VIDEO");
    expect(body).toContain("video_url=https%3A%2F%2Fexample.com%2Fclip.mp4");
    expect(body).toContain("alt_text=a+clip");
    expect(body).not.toContain("image_url");
  });
});

describe("ThreadsAPI.createCarouselPost", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("creates children then a CAROUSEL parent and publishes", async () => {
    const { calls } = mockFetchSequence([
      { id: "child1" },
      { status: "FINISHED" },
      { id: "child2" },
      { status: "FINISHED" },
      { id: "carousel1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    const id = await api.createCarouselPost("cap", [
      { url: "https://e/1.png", alt: "one" },
      { url: "https://e/2.png" },
    ]);
    expect(id).toBe("post1");

    const child1 = (calls[0].init?.body as URLSearchParams).toString();
    expect(child1).toContain("is_carousel_item=true");
    expect(child1).toContain("media_type=IMAGE");
    expect(child1).toContain("image_url=https%3A%2F%2Fe%2F1.png");
    expect(child1).toContain("alt_text=one");

    const child2 = (calls[2].init?.body as URLSearchParams).toString();
    expect(child2).toContain("is_carousel_item=true");
    expect(child2).not.toContain("alt_text");

    const parent = (calls[4].init?.body as URLSearchParams).toString();
    expect(parent).toContain("media_type=CAROUSEL");
    expect(parent).toContain("children=child1%2Cchild2");
    expect(parent).toContain("text=cap");
    expect(parent).not.toContain("is_carousel_item");
  });

  test("sends video children with video_url", async () => {
    const { calls } = mockFetchSequence([
      { id: "child1" },
      { status: "FINISHED" },
      { id: "child2" },
      { status: "FINISHED" },
      { id: "carousel1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createCarouselPost("cap", [
      { url: "https://e/1.png" },
      { url: "https://e/2.mp4" },
    ]);
    const videoChild = (calls[2].init?.body as URLSearchParams).toString();
    expect(videoChild).toContain("media_type=VIDEO");
    expect(videoChild).toContain("video_url=https%3A%2F%2Fe%2F2.mp4");
    expect(videoChild).not.toContain("image_url");
  });

  test("puts reply_to_id on the parent only", async () => {
    const { calls } = mockFetchSequence([
      { id: "child1" },
      { status: "FINISHED" },
      { id: "child2" },
      { status: "FINISHED" },
      { id: "carousel1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createCarouselPost("cap", [{ url: "https://e/1.png" }, { url: "https://e/2.png" }], "parent123");
    expect((calls[0].init?.body as URLSearchParams).toString()).not.toContain("reply_to_id");
    expect((calls[2].init?.body as URLSearchParams).toString()).not.toContain("reply_to_id");
    expect((calls[4].init?.body as URLSearchParams).toString()).toContain("reply_to_id=parent123");
  });

  test("throws before any request when fewer than 2 items", async () => {
    const spy = spyOn(globalThis, "fetch");
    const api = new ThreadsAPI("t", "u");
    await expect(api.createCarouselPost("cap", [{ url: "https://e/1.png" }])).rejects.toThrow(
      "Carousel requires 2-20 items (got 1)"
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test("throws when more than 20 items", async () => {
    const spy = spyOn(globalThis, "fetch");
    const api = new ThreadsAPI("t", "u");
    const items = Array.from({ length: 21 }, (_, i) => ({ url: `https://e/${i}.png` }));
    await expect(api.createCarouselPost("cap", items)).rejects.toThrow(
      "Carousel requires 2-20 items (got 21)"
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test("surfaces a child container error and stops before the parent", async () => {
    const { calls } = mockFetchSequence([
      { id: "child1" },
      { status: "ERROR", error_message: "bad media url" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await expect(
      api.createCarouselPost("cap", [{ url: "https://e/1.png" }, { url: "https://e/2.png" }])
    ).rejects.toThrow("Carousel item 1 (https://e/1.png) failed: Threads container ERROR: bad media url");
    expect(calls.length).toBe(2);
  });
});

describe("ThreadsAPI attachments", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  test("text post sends topic_tag, link_attachment and gif_attachment", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createTextPost("hi", undefined, {
      topicTag: "Coffee",
      linkAttachment: "https://example.com",
      gif: { id: "abc123" },
    });
    const body = (calls[0].init?.body as URLSearchParams).toString();
    expect(body).toContain("topic_tag=Coffee");
    expect(body).toContain("link_attachment=https%3A%2F%2Fexample.com");
    expect(body).toContain("gif_attachment=");
    const gif = new URLSearchParams((calls[0].init?.body as URLSearchParams).toString()).get("gif_attachment");
    expect(JSON.parse(gif!)).toEqual({ gif_id: "abc123", provider: "giphy" });
  });

  test("image post sends topic_tag but not link/gif attachments", async () => {
    const { calls } = mockFetchSequence([
      { id: "container1" },
      { status: "FINISHED" },
      { id: "post1" },
    ]);
    const api = new ThreadsAPI("t", "u");
    await api.createImagePost("hi", "https://e/1.png", undefined, undefined, {
      topicTag: "Coffee",
      linkAttachment: "https://example.com",
      gif: { id: "abc123" },
    });
    const body = (calls[0].init?.body as URLSearchParams).toString();
    expect(body).toContain("topic_tag=Coffee");
    expect(body).not.toContain("link_attachment");
    expect(body).not.toContain("gif_attachment");
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

describe("ThreadsAPI.getFollowerDemographics", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore();
  });

  const breakdown = (key: string, value: number) => ({
    data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: [key], value }] }] } }],
  });

  test("requests each breakdown and maps results to demographics", async () => {
    // Parallel requests fire in array order: country, city, age, gender.
    const { calls } = mockFetchSequence([
      breakdown("US", 100),
      breakdown("Brooklyn", 40),
      breakdown("25-34", 60),
      breakdown("F", 55),
    ]);
    const api = new ThreadsAPI("t", "u");
    const demographics = await api.getFollowerDemographics();
    expect(calls[0].url).toContain("metric=follower_demographics&breakdown=country");
    expect(demographics).toEqual({
      countries: { US: 100 },
      cities: { Brooklyn: 40 },
      age: { "25-34": 60 },
      gender: { F: 55 },
    });
  });

  test("omits breakdowns that error (e.g. <100 followers)", async () => {
    const impl = (async (url: string) => {
      if (typeof url === "string" && url.includes("breakdown=country")) {
        return new Response(JSON.stringify(breakdown("US", 100)), { status: 200 });
      }
      return new Response("too few followers", { status: 400 });
    }) as unknown as typeof fetch;
    spyOn(globalThis, "fetch").mockImplementation(impl);

    const api = new ThreadsAPI("t", "u");
    const demographics = await api.getFollowerDemographics();
    expect(demographics).toEqual({ countries: { US: 100 } });
  });
});
