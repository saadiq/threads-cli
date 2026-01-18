# threads-cli

A CLI tool for publishing to Threads and fetching Threads data as JSON.

## Features

- OAuth authentication with Meta's Threads API
- Publish text and image posts from markdown drafts
- Fetch posts with engagement metrics (views, likes, replies, reposts, quotes)
- View profile and follower insights
- Draft management with YAML frontmatter support
- Auto-archive published drafts

## Installation

```bash
bun install
```

## Setup

### 1. Create a Meta Developer App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Create a new app and select **Threads API** as the use case
3. Under **Customize use case**, add these permissions:
   - `threads_basic`
   - `threads_content_publish`
   - `threads_manage_insights`
4. Set the **Redirect Callback URL** to: `https://localhost:3000/callback`
5. Add yourself as a **Tester** under App Roles and accept the invitation in Threads settings

### 2. Generate SSL Certificates

Meta requires HTTPS for OAuth callbacks. Use [mkcert](https://github.com/FiloSottile/mkcert) to create local certificates:

```bash
# Install mkcert
brew install mkcert

# Install local CA
mkcert -install

# Generate certificates
mkcert localhost

# Move to config directory
mkdir -p ~/.threads-cli
mv localhost.pem localhost-key.pem ~/.threads-cli/
```

### 3. Authenticate

```bash
bun run src/index.ts auth login
```

This will prompt for your Meta App ID and App Secret, then open a browser for authorization.

## Usage

### Authentication

```bash
# Login (opens browser for OAuth)
threads auth login

# Check auth status
threads auth status

# Logout
threads auth logout
```

### Profile

```bash
# View your profile
threads profile

# Include follower insights
threads profile --insights
```

### Posts

```bash
# List recent posts with metrics
threads posts list
threads posts list --limit 50
threads posts list --since 2024-01-01

# Get a specific post by ID or URL
threads posts get <post-id>
threads posts get "https://threads.net/@user/post/abc123"

# Get replies to a post
threads posts replies <post-id>
```

### Drafts

```bash
# Create a new draft
threads draft new "My Post Title"

# List all drafts
threads draft list

# Delete a draft
threads draft delete <filename>
```

### Publishing

```bash
# Publish a draft (with confirmation)
threads publish my-draft.md

# Skip confirmation
threads publish my-draft.md --yes

# Preview only (dry run)
threads publish my-draft.md --dry-run
```

## Draft Format

Drafts are markdown files with YAML frontmatter:

```markdown
---
title: My Post Title
image: https://example.com/image.jpg
alt: Image description
created: 2024-01-15T10:30:00Z
---

Your post content goes here. This will be published to Threads.
```

- `title` - Optional title for organizing drafts
- `image` - Optional image URL to attach
- `alt` - Alt text for the image
- `created` - Auto-generated timestamp

## Configuration

Config is stored at `~/.threads-cli/config.json`:

```json
{
  "auth": {
    "app_id": "your-app-id",
    "app_secret": "your-app-secret",
    "access_token": "...",
    "user_id": "...",
    "expires_at": "2024-03-15T00:00:00.000Z"
  },
  "paths": {
    "drafts": "~/threads/drafts",
    "archive": "~/threads/archive"
  },
  "settings": {
    "archive_after_publish": true,
    "default_limit": 25
  }
}
```

### Environment Variables

- `THREADS_CLI_CONFIG_DIR` - Override the config directory (useful for testing)

## Development

```bash
# Run CLI
bun run src/index.ts <command>

# Run tests
bun test

# Type check
bun run typecheck
```

## Token Lifecycle

- Initial OAuth returns a **short-lived token** (1 hour)
- The CLI automatically exchanges it for a **long-lived token** (60 days)
- Tokens are auto-refreshed when expired

## License

MIT
