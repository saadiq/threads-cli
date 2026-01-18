# Threads CLI Design

A command-line tool to publish drafts and access Threads data for analysis.

## Overview

**Purpose:** Enable publishing to Threads from the terminal with a drafts-first workflow, and provide convenient access to Threads data (posts, metrics, profile) as JSON for analysis in Claude Code.

**Tech Stack:** TypeScript + Bun

## CLI Command Structure

```
threads
├── auth
│   ├── login          # Opens browser, completes OAuth flow
│   ├── logout         # Clears stored tokens
│   └── status         # Shows current auth state
│
├── draft
│   ├── new [title]    # Creates new markdown file in drafts folder
│   ├── list           # Lists all drafts
│   └── delete <file>  # Removes a draft
│
├── publish <file>     # Preview + confirm + post a markdown file
│   ├── --yes          # Skip confirmation
│   └── --dry-run      # Preview only, don't post
│
├── posts
│   ├── list           # Your recent posts with metrics
│   │   ├── --limit N  # Number of posts (default 25)
│   │   └── --since    # Filter by date
│   ├── get <id|url>   # Single post details + metrics
│   └── replies <id>   # Get replies to a post
│
├── profile            # Your profile info + follower count
│   └── --insights     # Include follower demographics
│
└── config
    ├── path           # Show config/drafts directory locations
    └── set <key> <v>  # Update settings
```

## Draft File Format

Markdown files with YAML frontmatter, stored in a configurable folder (Obsidian-compatible):

```markdown
---
title: "Optional title for your reference"
image: "https://example.com/image.png"  # Optional, must be public URL
alt: "Image description"                 # Alt text for accessibility
created: 2025-01-18T10:30:00Z
---

Your thread content goes here.

This is the actual text that will be posted to Threads.
Supports multiple lines - they'll be preserved.
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | No | For your organization only, not posted |
| `image` | No | Public URL to image |
| `alt` | No | Image alt text for accessibility |
| `created` | Auto | Set automatically when draft is created |

### Image Handling

- Images must be public URLs (Threads API fetches them)
- Local image hosting is out of scope for v1
- Pluggable upload endpoint can be added later if needed

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│  $ threads auth login                                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CLI starts local server on localhost:3000/callback         │
│  Opens browser to Meta OAuth URL                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  User authorizes app in browser                             │
│  Meta redirects to localhost:3000/callback?code=xxx         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CLI exchanges code for access_token + refresh_token        │
│  Stores tokens in ~/.threads-cli/config.json                │
│  Shows success message, closes browser tab                  │
└─────────────────────────────────────────────────────────────┘
```

### Token Management

- Access tokens expire (typically 60 days)
- CLI auto-refreshes when token is near expiry
- `threads auth status` shows expiry date
- Tokens stored with restricted file permissions (600)

### Required Setup (One-Time)

1. Create a Meta Developer account
2. Create a Threads app in Meta's dashboard
3. Configure redirect URI as `http://localhost:3000/callback`
4. Add App ID and Secret to CLI config

### Required Scopes

- `threads_basic` - Read profile and posts
- `threads_content_publish` - Publish posts
- `threads_manage_insights` - Access metrics and analytics

## Publishing Workflow

```
$ threads publish ./drafts/my-post.md

┌─────────────────────────────────────────────────────────────┐
│  Preview                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your thread content goes here.                             │
│                                                             │
│  This is the actual text that will be posted to Threads.    │
│                                                             │
│  Image: https://example.com/screenshot.png                  │
│                                                             │
│  Characters: 142 / 500                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Publish to Threads? [y/N] y

✓ Posted successfully
  https://threads.net/@yourhandle/post/abc123
```

### Validation

- Character limit check (500 chars)
- Image URL accessibility check (warns if 404 or not public)

### Flags

- `--yes` - Skip confirmation, post immediately
- `--dry-run` - Validate and preview only, don't post

### After Publish

- Outputs the post URL
- Moves draft to archive folder (configurable)

## Data Access Commands

All data commands output JSON, suitable for piping to files or tools like `jq`.

### Posts List

```bash
$ threads posts list --limit 10
```

```json
[
  {
    "id": "abc123",
    "text": "Your thread content...",
    "created_at": "2025-01-18T10:30:00Z",
    "url": "https://threads.net/@you/post/abc123",
    "metrics": {
      "views": 1234,
      "likes": 56,
      "replies": 12,
      "reposts": 3,
      "quotes": 1
    }
  }
]
```

### Single Post

```bash
$ threads posts get abc123
$ threads posts get https://threads.net/@you/post/abc123
```

### Profile

```bash
$ threads profile
```

```json
{
  "id": "user123",
  "username": "yourhandle",
  "bio": "Your bio text",
  "followers_count": 1234,
  "following_count": 567
}
```

```bash
$ threads profile --insights  # Adds demographics if available
```

### Replies

```bash
$ threads posts replies abc123
```

### Common Patterns

```bash
# Save to file for analysis
threads posts list --limit 100 > posts.json

# Filter with jq
threads posts list | jq '.[] | select(.metrics.likes > 50)'
```

## Configuration

### File Location

Config stored at `~/.threads-cli/config.json`

### Config Structure

```json
{
  "auth": {
    "app_id": "your-meta-app-id",
    "app_secret": "your-meta-app-secret",
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": "2025-03-18T10:30:00Z"
  },
  "paths": {
    "drafts": "~/Obsidian/Threads/drafts",
    "archive": "~/Obsidian/Threads/archive"
  },
  "settings": {
    "archive_after_publish": true,
    "default_limit": 25
  }
}
```

### Setting Paths

```bash
$ threads config set drafts_path ~/Obsidian/Threads/drafts
$ threads config set archive_path ~/Obsidian/Threads/archive
```

### Viewing Config

```bash
$ threads config path

Config file: ~/.threads-cli/config.json
Drafts folder: /Users/saadiq/Obsidian/Threads/drafts
Archive folder: /Users/saadiq/Obsidian/Threads/archive
```

### First-Run Experience

```
$ threads auth login

No config found. Let's set things up:

Meta App ID: [paste from developer console]
Meta App Secret: [paste from developer console]
Drafts folder [~/.threads-cli/drafts]: ~/Obsidian/Threads/drafts
Archive folder [~/.threads-cli/archive]: ~/Obsidian/Threads/archive

Opening browser for authorization...
```

## API Reference

### Threads API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/{user-id}/threads` | POST | Create post container |
| `/{user-id}/threads_publish` | POST | Publish container |
| `/{user-id}/threads` | GET | List user's posts |
| `/{media-id}` | GET | Get post details |
| `/{media-id}/insights` | GET | Get post metrics |
| `/{media-id}/replies` | GET | Get post replies |
| `/me` | GET | Get user profile |

### Rate Limits

- 250 API-published posts per 24-hour period
- Standard Graph API rate limits apply to read operations

## Project Structure

```
threads-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── auth.ts        # login, logout, status
│   │   ├── draft.ts       # new, list, delete
│   │   ├── publish.ts     # publish workflow
│   │   ├── posts.ts       # list, get, replies
│   │   ├── profile.ts     # profile info
│   │   └── config.ts      # config management
│   ├── lib/
│   │   ├── api.ts         # Threads API client
│   │   ├── auth.ts        # OAuth + token management
│   │   ├── config.ts      # Config file handling
│   │   ├── drafts.ts      # Draft file parsing
│   │   └── types.ts       # TypeScript types
│   └── utils/
│       └── display.ts     # Terminal output formatting
├── package.json
├── tsconfig.json
└── README.md
```

## Out of Scope for v1

- Video and carousel posts
- Local image upload/hosting
- Native Threads drafts integration (API doesn't support)
- Scheduling posts
- Analytics/visualization (user does this in Claude Code)
