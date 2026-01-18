import { describe, expect, test } from "bun:test";
import { ThreadsAPI, extractPostId } from "./api";

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
