# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run CLI
bun run src/index.ts <command>

# Run all tests
bun test

# Run specific test file
bun test src/lib/config.test.ts

# TypeScript check
bun run typecheck
```

## Architecture

This is a CLI tool for publishing to Threads and fetching Threads data as JSON.

**Entry point:** `src/index.ts` - Wires Commander.js commands together.

**Commands** (`src/commands/`): Each command module exports a `create*Command()` factory that returns a configured Commander instance. Commands handle CLI concerns (args, output) and delegate to lib modules.

**Libraries** (`src/lib/`):
- `types.ts` - All TypeScript interfaces (Config, Draft, API responses)
- `config.ts` - Loads/saves `~/.threads-cli/config.json`, supports `THREADS_CLI_CONFIG_DIR` env override for testing
- `drafts.ts` - Parses markdown files with gray-matter frontmatter
- `api.ts` - `ThreadsAPI` class wrapping Threads Graph API
- `auth.ts` - OAuth flow and token management (auto-refresh on expiry)

**Utilities** (`src/utils/`): `display.ts` - Terminal output helpers for preview boxes.

## Key Patterns

- Config stored at `~/.threads-cli/config.json` with 0o600 permissions
- Drafts are markdown files with YAML frontmatter (title, image, alt, created)
- Thread files are markdown with posts separated by `---` on its own line (including the first/last line); optional `![alt](url)` at the start of a post attaches an image
- `stripFrontmatter()` in `drafts.ts` only strips a leading `---` block when it parses as a YAML mapping with identifier-like keys, so a thread file that opens with a bare separator (or whose first post contains a colon) keeps its first post instead of losing it to gray-matter
- All data commands (posts, profile) output JSON to stdout
- Auth check pattern: `getValidAccessToken()` returns null if not authenticated
- Path traversal protection in draft delete command

## Gotchas

- **OAuth requires local HTTPS**: `auth login` spins up a server on `https://localhost:3000/callback` and expects `localhost.pem` + `localhost-key.pem` in `~/.threads-cli/` (generated via `mkcert localhost`). Without them, login fails before opening the browser.
- **Threads publish is a 3-step async flow** (`api.ts` `createAndPublish`): POST to `/threads` to get a container id → poll `/{id}?fields=status` until `FINISHED` (timeout 60s) → POST to `/threads_publish`. Don't skip the poll; containers can be `ERROR`/`EXPIRED`.
- **Thread chaining** uses `reply_to_id` on each subsequent post; `thread.ts` sleeps `RATE_LIMIT_DELAY_MS` (1s) between posts to avoid rate limits.
- **App ID pitfall**: the Threads App ID/Secret (App settings → Basic, scroll down) are distinct from the Meta App ID/Secret at the top of the same page. Using the Meta ones fails with error 4476002.
