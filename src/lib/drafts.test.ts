import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  parseDraft,
  createDraft,
  listDrafts,
  validateDraft,
  countLinks,
  DRAFT_CHAR_LIMIT,
  DRAFT_LINK_LIMIT,
  DRAFT_MEDIA_LIMIT,
} from "./drafts";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Draft } from "./types";

const TEST_DRAFTS_DIR = join(import.meta.dir, "../../.test-drafts");

describe("drafts", () => {
  beforeEach(() => {
    mkdirSync(TEST_DRAFTS_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DRAFTS_DIR, { recursive: true, force: true });
  });

  test("parseDraft extracts frontmatter and content", () => {
    const filePath = join(TEST_DRAFTS_DIR, "test.md");
    writeFileSync(
      filePath,
      `---
title: "Test Post"
image: "https://example.com/img.png"
---

This is the post content.
Multiple lines work.`
    );

    const draft = parseDraft(filePath);
    expect(draft.frontmatter.title).toBe("Test Post");
    expect(draft.frontmatter.image).toBe("https://example.com/img.png");
    expect(draft.content).toBe("This is the post content.\nMultiple lines work.");
    expect(draft.filePath).toBe(filePath);
  });

  test("parseDraft handles no frontmatter", () => {
    const filePath = join(TEST_DRAFTS_DIR, "plain.md");
    writeFileSync(filePath, "Just plain text content.");

    const draft = parseDraft(filePath);
    expect(draft.frontmatter).toEqual({});
    expect(draft.content).toBe("Just plain text content.");
  });

  test("createDraft creates markdown file with frontmatter", () => {
    const filePath = createDraft(TEST_DRAFTS_DIR, "My Title");
    const draft = parseDraft(filePath);
    expect(draft.frontmatter.title).toBe("My Title");
    expect(draft.frontmatter.created).toBeDefined();
  });

  test("listDrafts returns all markdown files", () => {
    writeFileSync(join(TEST_DRAFTS_DIR, "one.md"), "content");
    writeFileSync(join(TEST_DRAFTS_DIR, "two.md"), "content");
    writeFileSync(join(TEST_DRAFTS_DIR, "ignore.txt"), "content");

    const drafts = listDrafts(TEST_DRAFTS_DIR);
    expect(drafts.length).toBe(2);
    expect(drafts.some((d) => d.filePath.endsWith("one.md"))).toBe(true);
    expect(drafts.some((d) => d.filePath.endsWith("two.md"))).toBe(true);
  });
});

describe("validateDraft", () => {
  const createTestDraft = (content: string): Draft => ({
    frontmatter: { title: "Test" },
    content,
    filePath: "/test/path.md",
  });

  test("returns error for empty content", () => {
    const draft = createTestDraft("");
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Post has no content");
  });

  test("returns error for whitespace-only content", () => {
    const draft = createTestDraft("   \n\t  ");
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Post has no content");
  });

  test("accepts empty content when media is present", () => {
    const draft = createTestDraft("");
    const result = validateDraft(draft, 1);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("returns error for content over character limit", () => {
    const longContent = "a".repeat(DRAFT_CHAR_LIMIT + 1);
    const draft = createTestDraft(longContent);
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain(`exceeds ${DRAFT_CHAR_LIMIT} characters`);
  });

  test("returns valid for content within limit", () => {
    const draft = createTestDraft("This is valid content.");
    const result = validateDraft(draft);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("returns valid for content exactly at limit", () => {
    const exactContent = "a".repeat(DRAFT_CHAR_LIMIT);
    const draft = createTestDraft(exactContent);
    const result = validateDraft(draft);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects content with 5+ links", () => {
    const content = "see https://a.com https://b.com https://c.com https://d.com https://e.com";
    const draft = createTestDraft(content);
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("THREADS_API__LINK_LIMIT_EXCEEDED"))).toBe(true);
  });

  test("accepts content with 4 links", () => {
    const content = "see https://a.com https://b.com https://c.com https://d.com";
    const draft = createTestDraft(content);
    const result = validateDraft(draft);
    expect(result.valid).toBe(true);
  });

  test("accepts a carousel exactly at the media limit", () => {
    const result = validateDraft(createTestDraft("caption"), DRAFT_MEDIA_LIMIT);
    expect(result.valid).toBe(true);
  });

  test("rejects a carousel over the media limit", () => {
    const result = validateDraft(createTestDraft("caption"), DRAFT_MEDIA_LIMIT + 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(`at most ${DRAFT_MEDIA_LIMIT}`))).toBe(true);
  });
});

describe("countLinks", () => {
  test("returns 0 for no links", () => {
    expect(countLinks("no links here")).toBe(0);
  });

  test("counts a single https link", () => {
    expect(countLinks("go to https://example.com now")).toBe(1);
  });

  test("counts http and https links", () => {
    expect(countLinks("http://a.com and https://b.com")).toBe(2);
  });

  test("matches the limit constant", () => {
    const text = Array.from({ length: DRAFT_LINK_LIMIT }, (_, i) => `https://x${i}.com`).join(" ");
    expect(countLinks(text)).toBe(DRAFT_LINK_LIMIT);
  });
});
