import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { parseDraft, createDraft, listDrafts } from "./drafts";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

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
