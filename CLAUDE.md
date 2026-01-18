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
- All data commands (posts, profile) output JSON to stdout
- Auth check pattern: `getValidAccessToken()` returns null if not authenticated
- Path traversal protection in draft delete command
