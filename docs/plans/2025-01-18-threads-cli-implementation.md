# Threads CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool to publish drafts and access Threads data as JSON for analysis.

**Architecture:** Command-based CLI using Commander.js with modular command handlers. Config and tokens stored in `~/.threads-cli/`. Draft files are markdown with YAML frontmatter. All data commands output JSON to stdout.

**Tech Stack:** TypeScript, Bun, Commander.js, gray-matter (frontmatter parsing)

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`

**Step 1: Initialize bun project**

Run:
```bash
bun init -y
```

**Step 2: Install dependencies**

Run:
```bash
bun add commander gray-matter
bun add -d @types/node typescript
```

**Step 3: Update package.json**

Edit `package.json` to add bin entry and scripts:

```json
{
  "name": "threads-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "threads": "./src/index.ts"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 4: Create tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Create minimal CLI entry point**

Create `src/index.ts`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("threads")
  .description("CLI for publishing and analyzing Threads posts")
  .version("0.1.0");

program.parse();
```

**Step 6: Test CLI runs**

Run:
```bash
bun run src/index.ts --help
```

Expected: Shows help with "CLI for publishing and analyzing Threads posts"

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: initialize project with bun and commander"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/lib/types.ts`

**Step 1: Create types file**

Create `src/lib/types.ts`:

```typescript
export interface AuthConfig {
  app_id: string;
  app_secret: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  user_id?: string;
}

export interface PathsConfig {
  drafts: string;
  archive: string;
}

export interface SettingsConfig {
  archive_after_publish: boolean;
  default_limit: number;
}

export interface Config {
  auth: AuthConfig;
  paths: PathsConfig;
  settings: SettingsConfig;
}

export interface DraftFrontmatter {
  title?: string;
  image?: string;
  alt?: string;
  created?: string;
}

export interface Draft {
  frontmatter: DraftFrontmatter;
  content: string;
  filePath: string;
}

export interface PostMetrics {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}

export interface ThreadsPost {
  id: string;
  text: string;
  created_at: string;
  url: string;
  media_type?: string;
  media_url?: string;
  metrics?: PostMetrics;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  bio?: string;
  followers_count: number;
  following_count?: number;
  threads_profile_picture_url?: string;
}

export interface ThreadsInsights extends ThreadsProfile {
  demographics?: {
    countries?: Record<string, number>;
    cities?: Record<string, number>;
    age?: Record<string, number>;
    gender?: Record<string, number>;
  };
}
```

**Step 2: Verify types compile**

Run:
```bash
bun run typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TypeScript types for config, drafts, and API responses"
```

---

## Task 3: Config Management

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/config.test.ts`

**Step 1: Write failing test for config loading**

Create `src/lib/config.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, getConfigPath, DEFAULT_CONFIG } from "./config";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_CONFIG_DIR = join(import.meta.dir, "../../.test-config");

describe("config", () => {
  beforeEach(() => {
    process.env.THREADS_CLI_CONFIG_DIR = TEST_CONFIG_DIR;
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    delete process.env.THREADS_CLI_CONFIG_DIR;
  });

  test("getConfigPath returns correct path", () => {
    const path = getConfigPath();
    expect(path).toBe(join(TEST_CONFIG_DIR, "config.json"));
  });

  test("loadConfig returns default config when file doesn't exist", () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("saveConfig and loadConfig round-trip", () => {
    const config = {
      ...DEFAULT_CONFIG,
      auth: { ...DEFAULT_CONFIG.auth, app_id: "test-app-id" },
    };
    saveConfig(config);
    const loaded = loadConfig();
    expect(loaded.auth.app_id).toBe("test-app-id");
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/lib/config.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement config module**

Create `src/lib/config.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import type { Config } from "./types";

export const DEFAULT_CONFIG: Config = {
  auth: {
    app_id: "",
    app_secret: "",
  },
  paths: {
    drafts: join(homedir(), ".threads-cli", "drafts"),
    archive: join(homedir(), ".threads-cli", "archive"),
  },
  settings: {
    archive_after_publish: true,
    default_limit: 25,
  },
};

export function getConfigDir(): string {
  return process.env.THREADS_CLI_CONFIG_DIR || join(homedir(), ".threads-cli");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  const content = readFileSync(configPath, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  chmodSync(configPath, 0o600);
}

export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
```

**Step 4: Run tests**

Run:
```bash
bun test src/lib/config.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/config.ts src/lib/config.test.ts
git commit -m "feat: add config loading and saving with tests"
```

---

## Task 4: Draft Parsing

**Files:**
- Create: `src/lib/drafts.ts`
- Create: `src/lib/drafts.test.ts`

**Step 1: Write failing test for draft parsing**

Create `src/lib/drafts.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/lib/drafts.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement drafts module**

Create `src/lib/drafts.ts`:

```typescript
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";
import type { Draft, DraftFrontmatter } from "./types";

export function parseDraft(filePath: string): Draft {
  const content = readFileSync(filePath, "utf-8");
  const { data, content: body } = matter(content);
  return {
    frontmatter: data as DraftFrontmatter,
    content: body.trim(),
    filePath,
  };
}

export function createDraft(draftsDir: string, title?: string): string {
  const timestamp = new Date().toISOString();
  const slug = title
    ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)
    : `draft-${Date.now()}`;
  const filePath = join(draftsDir, `${slug}.md`);

  const frontmatter = [
    "---",
    title ? `title: "${title}"` : 'title: ""',
    `created: ${timestamp}`,
    "---",
    "",
    "",
  ].join("\n");

  writeFileSync(filePath, frontmatter);
  return filePath;
}

export function listDrafts(draftsDir: string): Draft[] {
  const files = readdirSync(draftsDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => parseDraft(join(draftsDir, f)));
}

export function validateDraft(draft: Draft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const charLimit = 500;

  if (!draft.content || draft.content.trim().length === 0) {
    errors.push("Draft has no content");
  }

  if (draft.content.length > charLimit) {
    errors.push(`Content exceeds ${charLimit} characters (${draft.content.length})`);
  }

  return { valid: errors.length === 0, errors };
}
```

**Step 4: Run tests**

Run:
```bash
bun test src/lib/drafts.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/drafts.ts src/lib/drafts.test.ts
git commit -m "feat: add draft parsing and creation with tests"
```

---

## Task 5: CLI Scaffolding with Subcommands

**Files:**
- Modify: `src/index.ts`
- Create: `src/commands/auth.ts`
- Create: `src/commands/config.ts`
- Create: `src/commands/draft.ts`
- Create: `src/commands/posts.ts`
- Create: `src/commands/profile.ts`
- Create: `src/commands/publish.ts`

**Step 1: Create command stubs**

Create `src/commands/auth.ts`:

```typescript
import { Command } from "commander";

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with Threads via browser")
    .action(() => {
      console.log("TODO: Implement login");
    });

  auth
    .command("logout")
    .description("Clear stored authentication")
    .action(() => {
      console.log("TODO: Implement logout");
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      console.log("TODO: Implement status");
    });

  return auth;
}
```

Create `src/commands/config.ts`:

```typescript
import { Command } from "commander";

export function createConfigCommand(): Command {
  const config = new Command("config").description("Manage configuration");

  config
    .command("path")
    .description("Show config and drafts directory paths")
    .action(() => {
      console.log("TODO: Implement path");
    });

  config
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key: string, value: string) => {
      console.log(`TODO: Set ${key} to ${value}`);
    });

  return config;
}
```

Create `src/commands/draft.ts`:

```typescript
import { Command } from "commander";

export function createDraftCommand(): Command {
  const draft = new Command("draft").description("Manage draft posts");

  draft
    .command("new [title]")
    .description("Create a new draft")
    .action((title?: string) => {
      console.log(`TODO: Create draft with title: ${title}`);
    });

  draft
    .command("list")
    .description("List all drafts")
    .action(() => {
      console.log("TODO: List drafts");
    });

  draft
    .command("delete <file>")
    .description("Delete a draft")
    .action((file: string) => {
      console.log(`TODO: Delete ${file}`);
    });

  return draft;
}
```

Create `src/commands/posts.ts`:

```typescript
import { Command } from "commander";

export function createPostsCommand(): Command {
  const posts = new Command("posts").description("Fetch and view posts");

  posts
    .command("list")
    .description("List your recent posts")
    .option("-l, --limit <n>", "Number of posts", "25")
    .option("--since <date>", "Filter posts since date")
    .action((options) => {
      console.log(`TODO: List posts with limit ${options.limit}`);
    });

  posts
    .command("get <id>")
    .description("Get a specific post by ID or URL")
    .action((id: string) => {
      console.log(`TODO: Get post ${id}`);
    });

  posts
    .command("replies <id>")
    .description("Get replies to a post")
    .action((id: string) => {
      console.log(`TODO: Get replies for ${id}`);
    });

  return posts;
}
```

Create `src/commands/profile.ts`:

```typescript
import { Command } from "commander";

export function createProfileCommand(): Command {
  const profile = new Command("profile")
    .description("View your profile info")
    .option("--insights", "Include follower demographics")
    .action((options) => {
      console.log(`TODO: Show profile, insights: ${options.insights}`);
    });

  return profile;
}
```

Create `src/commands/publish.ts`:

```typescript
import { Command } from "commander";

export function createPublishCommand(): Command {
  const publish = new Command("publish")
    .description("Publish a draft to Threads")
    .argument("<file>", "Path to markdown draft file")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Preview only, don't post")
    .action((file: string, options) => {
      console.log(`TODO: Publish ${file}, yes: ${options.yes}, dryRun: ${options.dryRun}`);
    });

  return publish;
}
```

**Step 2: Wire up commands in index.ts**

Update `src/index.ts`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { createAuthCommand } from "./commands/auth";
import { createConfigCommand } from "./commands/config";
import { createDraftCommand } from "./commands/draft";
import { createPostsCommand } from "./commands/posts";
import { createProfileCommand } from "./commands/profile";
import { createPublishCommand } from "./commands/publish";

const program = new Command();

program
  .name("threads")
  .description("CLI for publishing and analyzing Threads posts")
  .version("0.1.0");

program.addCommand(createAuthCommand());
program.addCommand(createConfigCommand());
program.addCommand(createDraftCommand());
program.addCommand(createPostsCommand());
program.addCommand(createProfileCommand());
program.addCommand(createPublishCommand());

program.parse();
```

**Step 3: Test CLI structure**

Run:
```bash
bun run src/index.ts --help
bun run src/index.ts auth --help
bun run src/index.ts draft --help
```

Expected: Shows help for each command group

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold CLI with all command stubs"
```

---

## Task 6: Implement Config Commands

**Files:**
- Modify: `src/commands/config.ts`

**Step 1: Implement config path command**

Update `src/commands/config.ts`:

```typescript
import { Command } from "commander";
import { getConfigPath, loadConfig, saveConfig, expandPath } from "../lib/config";

export function createConfigCommand(): Command {
  const config = new Command("config").description("Manage configuration");

  config
    .command("path")
    .description("Show config and drafts directory paths")
    .action(() => {
      const cfg = loadConfig();
      console.log(`Config file: ${getConfigPath()}`);
      console.log(`Drafts folder: ${expandPath(cfg.paths.drafts)}`);
      console.log(`Archive folder: ${expandPath(cfg.paths.archive)}`);
    });

  config
    .command("set <key> <value>")
    .description("Set a configuration value (drafts_path, archive_path, default_limit)")
    .action((key: string, value: string) => {
      const cfg = loadConfig();

      switch (key) {
        case "drafts_path":
          cfg.paths.drafts = value;
          break;
        case "archive_path":
          cfg.paths.archive = value;
          break;
        case "default_limit":
          cfg.settings.default_limit = parseInt(value, 10);
          break;
        case "archive_after_publish":
          cfg.settings.archive_after_publish = value === "true";
          break;
        default:
          console.error(`Unknown config key: ${key}`);
          console.error("Valid keys: drafts_path, archive_path, default_limit, archive_after_publish");
          process.exit(1);
      }

      saveConfig(cfg);
      console.log(`Set ${key} = ${value}`);
    });

  return config;
}
```

**Step 2: Test config commands**

Run:
```bash
bun run src/index.ts config path
bun run src/index.ts config set drafts_path ~/test-drafts
bun run src/index.ts config path
```

Expected: Shows paths, sets new path, shows updated path

**Step 3: Commit**

```bash
git add src/commands/config.ts
git commit -m "feat: implement config path and set commands"
```

---

## Task 7: Implement Draft Commands

**Files:**
- Modify: `src/commands/draft.ts`

**Step 1: Implement draft commands**

Update `src/commands/draft.ts`:

```typescript
import { Command } from "commander";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { resolve, basename } from "path";
import { loadConfig, expandPath } from "../lib/config";
import { createDraft, listDrafts, parseDraft } from "../lib/drafts";

export function createDraftCommand(): Command {
  const draft = new Command("draft").description("Manage draft posts");

  draft
    .command("new [title]")
    .description("Create a new draft")
    .action((title?: string) => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);

      if (!existsSync(draftsDir)) {
        mkdirSync(draftsDir, { recursive: true });
      }

      const filePath = createDraft(draftsDir, title);
      console.log(`Created draft: ${filePath}`);
    });

  draft
    .command("list")
    .description("List all drafts")
    .action(() => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);

      if (!existsSync(draftsDir)) {
        console.log("No drafts folder found.");
        return;
      }

      const drafts = listDrafts(draftsDir);
      if (drafts.length === 0) {
        console.log("No drafts found.");
        return;
      }

      for (const d of drafts) {
        const title = d.frontmatter.title || "(untitled)";
        const preview = d.content.slice(0, 50).replace(/\n/g, " ");
        console.log(`${basename(d.filePath)}`);
        console.log(`  Title: ${title}`);
        console.log(`  Preview: ${preview}${d.content.length > 50 ? "..." : ""}`);
        console.log();
      }
    });

  draft
    .command("delete <file>")
    .description("Delete a draft")
    .action((file: string) => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);
      const filePath = resolve(draftsDir, file);

      if (!existsSync(filePath)) {
        console.error(`Draft not found: ${filePath}`);
        process.exit(1);
      }

      unlinkSync(filePath);
      console.log(`Deleted: ${filePath}`);
    });

  return draft;
}
```

**Step 2: Test draft commands**

Run:
```bash
bun run src/index.ts draft new "Test Post"
bun run src/index.ts draft list
bun run src/index.ts draft delete test-post.md
```

Expected: Creates draft, lists it, deletes it

**Step 3: Commit**

```bash
git add src/commands/draft.ts
git commit -m "feat: implement draft new, list, and delete commands"
```

---

## Task 8: Threads API Client

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/api.test.ts`

**Step 1: Write test for API client**

Create `src/lib/api.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/lib/api.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement API client**

Create `src/lib/api.ts`:

```typescript
import type { ThreadsPost, ThreadsProfile, ThreadsInsights, PostMetrics } from "./types";

const BASE_URL = "https://graph.threads.net/v1.0";

export function extractPostId(idOrUrl: string): string {
  const urlMatch = idOrUrl.match(/threads\.net\/@[\w.]+\/post\/(\w+)/);
  return urlMatch ? urlMatch[1] : idOrUrl;
}

export class ThreadsAPI {
  constructor(
    private accessToken: string,
    private userId: string
  ) {}

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);

    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads API error: ${response.status} - ${error}`);
    }
    return response.json();
  }

  async getProfile(): Promise<ThreadsProfile> {
    const fields = "id,username,threads_profile_picture_url,threads_biography";
    const data = await this.fetch<any>(`/me?fields=${fields}`);
    return {
      id: data.id,
      username: data.username,
      bio: data.threads_biography,
      followers_count: 0, // Fetched separately
      threads_profile_picture_url: data.threads_profile_picture_url,
    };
  }

  async getFollowerCount(): Promise<number> {
    const data = await this.fetch<any>(`/me?fields=followers_count`);
    return data.followers_count || 0;
  }

  async getInsights(): Promise<ThreadsInsights> {
    const profile = await this.getProfile();
    const followersCount = await this.getFollowerCount();
    return { ...profile, followers_count: followersCount };
  }

  async getPosts(limit: number = 25): Promise<ThreadsPost[]> {
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.fetch<any>(
      `/${this.userId}/threads?fields=${fields}&limit=${limit}`
    );

    const posts: ThreadsPost[] = [];
    for (const post of data.data || []) {
      const metrics = await this.getPostMetrics(post.id).catch(() => undefined);
      posts.push({
        id: post.id,
        text: post.text || "",
        created_at: post.timestamp,
        url: post.permalink,
        media_type: post.media_type,
        media_url: post.media_url,
        metrics,
      });
    }
    return posts;
  }

  async getPost(postId: string): Promise<ThreadsPost> {
    const id = extractPostId(postId);
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.fetch<any>(`/${id}?fields=${fields}`);
    const metrics = await this.getPostMetrics(id).catch(() => undefined);

    return {
      id: data.id,
      text: data.text || "",
      created_at: data.timestamp,
      url: data.permalink,
      media_type: data.media_type,
      media_url: data.media_url,
      metrics,
    };
  }

  async getPostMetrics(postId: string): Promise<PostMetrics> {
    const metrics = "views,likes,replies,reposts,quotes";
    const data = await this.fetch<any>(`/${postId}/insights?metric=${metrics}`);

    const result: PostMetrics = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 };
    for (const item of data.data || []) {
      const name = item.name as keyof PostMetrics;
      if (name in result) {
        result[name] = item.values?.[0]?.value || 0;
      }
    }
    return result;
  }

  async getReplies(postId: string): Promise<ThreadsPost[]> {
    const id = extractPostId(postId);
    const fields = "id,text,timestamp,username,permalink";
    const data = await this.fetch<any>(`/${id}/replies?fields=${fields}`);

    return (data.data || []).map((reply: any) => ({
      id: reply.id,
      text: reply.text || "",
      created_at: reply.timestamp,
      url: reply.permalink,
    }));
  }

  async createTextPost(text: string): Promise<string> {
    // Step 1: Create container
    const containerData = await this.fetch<any>(`/${this.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "TEXT", text }),
    });

    const containerId = containerData.id;

    // Step 2: Publish
    const publishData = await this.fetch<any>(`/${this.userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId }),
    });

    return publishData.id;
  }

  async createImagePost(text: string, imageUrl: string): Promise<string> {
    // Step 1: Create container with image
    const containerData = await this.fetch<any>(`/${this.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "IMAGE", image_url: imageUrl, text }),
    });

    const containerId = containerData.id;

    // Step 2: Publish
    const publishData = await this.fetch<any>(`/${this.userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId }),
    });

    return publishData.id;
  }
}
```

**Step 4: Run tests**

Run:
```bash
bun test src/lib/api.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat: add Threads API client with posts, profile, and publishing"
```

---

## Task 9: OAuth Authentication

**Files:**
- Create: `src/lib/auth.ts`
- Modify: `src/commands/auth.ts`

**Step 1: Create auth module**

Create `src/lib/auth.ts`:

```typescript
import { loadConfig, saveConfig } from "./config";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const REDIRECT_URI = "http://localhost:3000/callback";
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

export function getAuthUrl(appId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `${THREADS_AUTH_URL}?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(THREADS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    userId: data.user_id,
  };
}

export async function refreshAccessToken(
  appId: string,
  appSecret: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${accessToken}`,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error("Token refresh failed");
  }

  const data = await response.json();
  return data.access_token;
}

export function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt);
  const now = new Date();
  // Consider expired if less than 1 day remaining
  return expiry.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
}

export async function getValidAccessToken(): Promise<{ token: string; userId: string } | null> {
  const config = loadConfig();
  const { access_token, user_id, expires_at, app_id, app_secret } = config.auth;

  if (!access_token || !user_id) {
    return null;
  }

  if (isTokenExpired(expires_at) && app_id && app_secret) {
    try {
      const newToken = await refreshAccessToken(app_id, app_secret, access_token);
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
      config.auth.access_token = newToken;
      config.auth.expires_at = expiresAt;
      saveConfig(config);
      return { token: newToken, userId: user_id };
    } catch {
      return null;
    }
  }

  return { token: access_token, userId: user_id };
}
```

**Step 2: Implement auth commands**

Update `src/commands/auth.ts`:

```typescript
import { Command } from "commander";
import { createServer } from "http";
import { loadConfig, saveConfig } from "../lib/config";
import { getAuthUrl, exchangeCodeForToken, getValidAccessToken } from "../lib/auth";
import * as readline from "readline";

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with Threads via browser")
    .action(async () => {
      const config = loadConfig();

      // Check if app credentials exist
      if (!config.auth.app_id || !config.auth.app_secret) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const question = (q: string): Promise<string> =>
          new Promise((resolve) => rl.question(q, resolve));

        console.log("\nNo app credentials found. Let's set them up.\n");
        console.log("1. Go to https://developers.facebook.com/apps");
        console.log("2. Create a new app with Threads API access");
        console.log("3. Add http://localhost:3000/callback as a redirect URI\n");

        config.auth.app_id = await question("Meta App ID: ");
        config.auth.app_secret = await question("Meta App Secret: ");

        const draftsPath = await question(
          `Drafts folder [${config.paths.drafts}]: `
        );
        if (draftsPath) config.paths.drafts = draftsPath;

        const archivePath = await question(
          `Archive folder [${config.paths.archive}]: `
        );
        if (archivePath) config.paths.archive = archivePath;

        rl.close();
        saveConfig(config);
      }

      // Start local server for callback
      const authUrl = getAuthUrl(config.auth.app_id);

      console.log("\nOpening browser for authorization...");
      console.log(`If browser doesn't open, visit: ${authUrl}\n`);

      // Open browser
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      Bun.spawn([openCmd, authUrl]);

      // Wait for callback
      const code = await new Promise<string>((resolve, reject) => {
        const server = createServer((req, res) => {
          const url = new URL(req.url!, `http://localhost:3000`);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Authorization failed</h1><p>You can close this tab.</p>");
            server.close();
            reject(new Error(error));
            return;
          }

          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>");
            server.close();
            resolve(code);
          }
        });

        server.listen(3000, () => {
          console.log("Waiting for authorization...");
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          server.close();
          reject(new Error("Authorization timed out"));
        }, 5 * 60 * 1000);
      });

      // Exchange code for token
      console.log("Exchanging code for access token...");
      const { accessToken, userId } = await exchangeCodeForToken(
        code,
        config.auth.app_id,
        config.auth.app_secret
      );

      // Save tokens
      config.auth.access_token = accessToken;
      config.auth.user_id = userId;
      config.auth.expires_at = new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      ).toISOString(); // 60 days
      saveConfig(config);

      console.log("\n✓ Successfully authenticated!");
      console.log(`  User ID: ${userId}`);
    });

  auth
    .command("logout")
    .description("Clear stored authentication")
    .action(() => {
      const config = loadConfig();
      delete config.auth.access_token;
      delete config.auth.refresh_token;
      delete config.auth.user_id;
      delete config.auth.expires_at;
      saveConfig(config);
      console.log("Logged out successfully.");
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(async () => {
      const config = loadConfig();

      if (!config.auth.app_id) {
        console.log("Status: Not configured");
        console.log("Run 'threads auth login' to set up.");
        return;
      }

      const auth = await getValidAccessToken();
      if (!auth) {
        console.log("Status: Not authenticated");
        console.log("Run 'threads auth login' to authenticate.");
        return;
      }

      console.log("Status: Authenticated");
      console.log(`User ID: ${auth.userId}`);
      if (config.auth.expires_at) {
        const expires = new Date(config.auth.expires_at);
        console.log(`Token expires: ${expires.toLocaleDateString()}`);
      }
    });

  return auth;
}
```

**Step 3: Test auth status**

Run:
```bash
bun run src/index.ts auth status
```

Expected: Shows "Not configured" or "Not authenticated"

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/commands/auth.ts
git commit -m "feat: implement OAuth authentication flow"
```

---

## Task 10: Implement Posts Commands

**Files:**
- Modify: `src/commands/posts.ts`

**Step 1: Implement posts commands**

Update `src/commands/posts.ts`:

```typescript
import { Command } from "commander";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI } from "../lib/api";

async function requireAuth(): Promise<ThreadsAPI> {
  const auth = await getValidAccessToken();
  if (!auth) {
    console.error("Not authenticated. Run 'threads auth login' first.");
    process.exit(1);
  }
  return new ThreadsAPI(auth.token, auth.userId);
}

export function createPostsCommand(): Command {
  const posts = new Command("posts").description("Fetch and view posts");

  posts
    .command("list")
    .description("List your recent posts with metrics")
    .option("-l, --limit <n>", "Number of posts", "25")
    .option("--since <date>", "Filter posts since date (ISO format)")
    .action(async (options) => {
      const api = await requireAuth();
      const limit = parseInt(options.limit, 10);

      try {
        let posts = await api.getPosts(limit);

        if (options.since) {
          const sinceDate = new Date(options.since);
          posts = posts.filter((p) => new Date(p.created_at) >= sinceDate);
        }

        console.log(JSON.stringify(posts, null, 2));
      } catch (error) {
        console.error("Failed to fetch posts:", error);
        process.exit(1);
      }
    });

  posts
    .command("get <id>")
    .description("Get a specific post by ID or URL")
    .action(async (id: string) => {
      const api = await requireAuth();

      try {
        const post = await api.getPost(id);
        console.log(JSON.stringify(post, null, 2));
      } catch (error) {
        console.error("Failed to fetch post:", error);
        process.exit(1);
      }
    });

  posts
    .command("replies <id>")
    .description("Get replies to a post")
    .action(async (id: string) => {
      const api = await requireAuth();

      try {
        const replies = await api.getReplies(id);
        console.log(JSON.stringify(replies, null, 2));
      } catch (error) {
        console.error("Failed to fetch replies:", error);
        process.exit(1);
      }
    });

  return posts;
}
```

**Step 2: Commit**

```bash
git add src/commands/posts.ts
git commit -m "feat: implement posts list, get, and replies commands"
```

---

## Task 11: Implement Profile Command

**Files:**
- Modify: `src/commands/profile.ts`

**Step 1: Implement profile command**

Update `src/commands/profile.ts`:

```typescript
import { Command } from "commander";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI } from "../lib/api";

export function createProfileCommand(): Command {
  const profile = new Command("profile")
    .description("View your profile info")
    .option("--insights", "Include follower demographics")
    .action(async (options) => {
      const auth = await getValidAccessToken();
      if (!auth) {
        console.error("Not authenticated. Run 'threads auth login' first.");
        process.exit(1);
      }

      const api = new ThreadsAPI(auth.token, auth.userId);

      try {
        const data = options.insights
          ? await api.getInsights()
          : await api.getProfile();

        // Add follower count
        const followersCount = await api.getFollowerCount();
        const result = { ...data, followers_count: followersCount };

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        process.exit(1);
      }
    });

  return profile;
}
```

**Step 2: Commit**

```bash
git add src/commands/profile.ts
git commit -m "feat: implement profile command with insights option"
```

---

## Task 12: Implement Publish Command

**Files:**
- Modify: `src/commands/publish.ts`
- Create: `src/utils/display.ts`

**Step 1: Create display utility**

Create `src/utils/display.ts`:

```typescript
export function displayPreview(content: string, imageUrl?: string): void {
  const width = 60;
  const border = "─".repeat(width);

  console.log(`┌${border}┐`);
  console.log(`│ Preview${" ".repeat(width - 8)}│`);
  console.log(`├${border}┤`);

  // Wrap content
  const lines = content.split("\n");
  for (const line of lines) {
    const chunks = chunkString(line, width - 2);
    for (const chunk of chunks) {
      console.log(`│ ${chunk.padEnd(width - 2)}│`);
    }
  }

  if (imageUrl) {
    console.log(`│${" ".repeat(width)}│`);
    console.log(`│ 📷 Image: ${imageUrl.slice(0, width - 12).padEnd(width - 2)}│`);
  }

  console.log(`│${" ".repeat(width)}│`);
  console.log(`│ Characters: ${content.length} / 500${" ".repeat(width - 22 - String(content.length).length)}│`);
  console.log(`└${border}┘`);
}

function chunkString(str: string, length: number): string[] {
  if (str.length <= length) return [str];
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}

export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);

  const response = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setRawMode?.(false);
    process.stdin.once("data", (chunk) => {
      data = chunk.toString().trim().toLowerCase();
      resolve(data);
    });
  });

  return response === "y" || response === "yes";
}
```

**Step 2: Implement publish command**

Update `src/commands/publish.ts`:

```typescript
import { Command } from "commander";
import { existsSync, renameSync, mkdirSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { loadConfig, expandPath } from "../lib/config";
import { parseDraft, validateDraft } from "../lib/drafts";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI } from "../lib/api";
import { displayPreview, confirm } from "../utils/display";

export function createPublishCommand(): Command {
  const publish = new Command("publish")
    .description("Publish a draft to Threads")
    .argument("<file>", "Path to markdown draft file")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Preview only, don't post")
    .action(async (file: string, options) => {
      // Resolve file path
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);
      const filePath = file.startsWith("/") ? file : resolve(draftsDir, file);

      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      // Parse draft
      const draft = parseDraft(filePath);
      const { valid, errors } = validateDraft(draft);

      if (!valid) {
        console.error("Validation errors:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      // Display preview
      displayPreview(draft.content, draft.frontmatter.image);
      console.log();

      // Dry run stops here
      if (options.dryRun) {
        console.log("Dry run - not posting.");
        return;
      }

      // Confirm unless --yes
      if (!options.yes) {
        const confirmed = await confirm("Publish to Threads?");
        if (!confirmed) {
          console.log("Cancelled.");
          return;
        }
      }

      // Authenticate
      const auth = await getValidAccessToken();
      if (!auth) {
        console.error("Not authenticated. Run 'threads auth login' first.");
        process.exit(1);
      }

      const api = new ThreadsAPI(auth.token, auth.userId);

      // Publish
      try {
        let postId: string;
        if (draft.frontmatter.image) {
          postId = await api.createImagePost(draft.content, draft.frontmatter.image);
        } else {
          postId = await api.createTextPost(draft.content);
        }

        // Get the post URL
        const post = await api.getPost(postId);

        console.log("\n✓ Posted successfully");
        console.log(`  ${post.url}`);

        // Archive if configured
        if (config.settings.archive_after_publish) {
          const archiveDir = expandPath(config.paths.archive);
          mkdirSync(archiveDir, { recursive: true });
          const archivePath = join(archiveDir, basename(filePath));
          renameSync(filePath, archivePath);
          console.log(`  Archived to: ${archivePath}`);
        }
      } catch (error) {
        console.error("Failed to publish:", error);
        process.exit(1);
      }
    });

  return publish;
}
```

**Step 3: Test publish dry-run**

Run:
```bash
bun run src/index.ts draft new "Test publish"
# Edit the draft to add content
bun run src/index.ts publish --dry-run test-publish.md
```

Expected: Shows preview, says "Dry run - not posting"

**Step 4: Commit**

```bash
git add src/commands/publish.ts src/utils/display.ts
git commit -m "feat: implement publish command with preview and confirmation"
```

---

## Task 13: Final Integration Test

**Step 1: Run all tests**

Run:
```bash
bun test
```

Expected: All tests pass

**Step 2: Test full CLI**

Run:
```bash
bun run src/index.ts --help
bun run src/index.ts auth --help
bun run src/index.ts posts --help
bun run src/index.ts draft --help
bun run src/index.ts config path
```

Expected: All commands show proper help/output

**Step 3: Run typecheck**

Run:
```bash
bun run typecheck
```

Expected: No errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: complete threads-cli v0.1.0 implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Project setup with Bun and Commander |
| 2 | TypeScript types for config, drafts, API |
| 3 | Config loading/saving with tests |
| 4 | Draft parsing with gray-matter |
| 5 | CLI scaffolding with all subcommands |
| 6 | Config path and set commands |
| 7 | Draft new, list, delete commands |
| 8 | Threads API client |
| 9 | OAuth authentication flow |
| 10 | Posts list, get, replies commands |
| 11 | Profile command with insights |
| 12 | Publish command with preview |
| 13 | Final integration testing |
