import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseThreadFile } from "./thread";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "threads-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeThread(content: string): string {
  const file = join(makeTempDir(), "thread.md");
  writeFileSync(file, content);
  return file;
}

// Run the real CLI against a throwaway config dir so the test never reads the
// developer's ~/.threads-cli/config.json.
function runThread(file: string) {
  return Bun.$`bun run src/index.ts thread ${file} --dry-run`
    .cwd(REPO_ROOT)
    .env({ ...process.env, THREADS_CLI_CONFIG_DIR: makeTempDir() })
    .quiet()
    .nothrow();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parseThreadFile", () => {
  test("strips YAML frontmatter before splitting thread posts", () => {
    const posts = parseThreadFile(
      writeThread(`---
title: Test thread
platform: threads
---

First post

---

Second post
`)
    );

    expect(posts.map((p) => p.content)).toEqual(["First post", "Second post"]);
  });

  test("drops a trailing separator instead of publishing it as text", () => {
    const posts = parseThreadFile(writeThread("First post\n\n---\n\nSecond post\n\n---\n"));

    expect(posts.map((p) => p.content)).toEqual(["First post", "Second post"]);
  });

  test("keeps the first post when the file opens with a separator", () => {
    const posts = parseThreadFile(writeThread("---\nFirst post\n---\nSecond post\n---\nThird post\n"));

    expect(posts.map((p) => p.content)).toEqual(["First post", "Second post", "Third post"]);
  });

  test("treats an unparseable leading block as a post, not as frontmatter", () => {
    const posts = parseThreadFile(
      writeThread("---\nMy thoughts: on stuff: today\n---\nSecond post\n")
    );

    expect(posts.map((p) => p.content)).toEqual(["My thoughts: on stuff: today", "Second post"]);
  });

  test("keeps a prose first post that happens to parse as YAML", () => {
    const posts = parseThreadFile(
      writeThread("---\nHey everyone: check this out\n---\nSecond post\n---\nThird post\n")
    );

    expect(posts.map((p) => p.content)).toEqual([
      "Hey everyone: check this out",
      "Second post",
      "Third post",
    ]);
  });

  test("splits CRLF thread files", () => {
    const posts = parseThreadFile(writeThread("First post\r\n\r\n---\r\n\r\nSecond post\r\n"));

    expect(posts.map((p) => p.content)).toEqual(["First post", "Second post"]);
  });
});

describe("thread command preflight", () => {
  test("does not crash on a malformed leading block", async () => {
    const file = writeThread("---\nMy thoughts: on stuff: today\n---\nSecond post\n");

    const result = await runThread(file);

    expect(result.stderr.toString()).not.toContain("YAMLException");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Thread Preview (2 posts)");
  });
});
