# threads-cli

A CLI tool for publishing to Threads and fetching Threads data as JSON.

## Features

- OAuth authentication with Meta's Threads API
- Publish text, image, video, and carousel (2–20 item) posts from markdown drafts
- Publish multi-post threads from a single file
- Attach links, GIFs, and topic tags to posts
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

> **Important:** This CLI authenticates against the **Threads** API, which uses a separate app ID/secret from the top-level Meta app. You'll need the **Threads App ID** and **Threads App secret**, found at **App Dashboard → App settings → Basic** (scroll down — they're distinct from the Meta App ID/Secret shown at the top of that page). Using the Meta App ID will fail with: `Authorization Failed: No app ID was sent with the request` (error 4476002).

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

This will prompt for your **Threads App ID** and **Threads App secret** (see the note above — these are different from the Meta App ID/Secret), then open a browser for authorization.

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

# Fetch all posts since a date, paging as needed
# (--since returns every matching post; --limit is ignored here)
threads posts list --since 2024-01-01

# Get a specific post by ID or URL
threads posts get <post-id>
threads posts get "https://threads.net/@user/post/abc123"

# Get replies to a post
threads posts replies <post-id>

# Delete a post by ID or URL (prompts for confirmation; --yes to skip)
threads posts delete <post-id>
threads posts delete <post-id> --yes
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

### Threads (multi-post)

```bash
# Publish a thread of connected posts from one file
threads thread my-thread.md

# Skip confirmation / preview only
threads thread my-thread.md --yes
threads thread my-thread.md --dry-run
```

### Config

```bash
# Show the config file, drafts, and archive paths
threads config path

# Set a configuration value
threads config set drafts_path ~/threads/drafts
threads config set archive_path ~/threads/archive
threads config set default_limit 50
threads config set archive_after_publish false
```

Settable keys: `drafts_path`, `archive_path`, `default_limit`,
`archive_after_publish`.

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

Frontmatter fields:

- `title` - Optional title for organizing drafts
- `image` - Single image URL to attach
- `video` - Single video URL to attach
- `images` - Carousel of 2–20 items; each item is `{ url, alt?, type? }` where
  `type` is `IMAGE` or `VIDEO` (inferred from the URL when omitted)
- `alt` - Alt text for a single `image`/`video`
- `link` - URL to attach as a link preview (text-only posts only)
- `gif` - GIF attachment id (text-only posts only)
- `topic` - Topic tag, 1–50 characters, no periods or ampersands
- `created` - Auto-generated timestamp

Media posts may be **caption-less** — a draft whose body is empty still publishes
if it carries an `image`, `video`, or `images` carousel. A carousel example:

```markdown
---
images:
  - url: https://example.com/one.jpg
    alt: First slide
  - url: https://example.com/clip.mp4
    type: VIDEO
---

Optional caption for the carousel.
```

## Thread Format

A thread is a markdown file with posts separated by `---` on its own line. Each
post is published in order and chained as a reply to the previous one. A file
needs at least two posts (use `publish` for single posts).

```markdown
First post in the thread.

---

Second post.

---

![Alt text](https://example.com/image.jpg) Third post with a leading image.
```

A post may start with one or more `![alt](url)` image lines; stacked image lines
become a carousel (up to 20 items), and trailing text on the same line as the
last image becomes that post's caption.

A thread file may also open with YAML frontmatter (e.g. `title:`), which is
stripped before the posts are split. Frontmatter fields are ignored by `thread`
— per-post media comes from `![alt](url)` lines, not frontmatter. A leading `---`
block is only treated as frontmatter when it parses as a YAML mapping whose keys
look like frontmatter fields, so a file that opens with a bare separator (or a
first post containing a colon) still keeps every post.

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
    "drafts": "~/.threads-cli/drafts",
    "archive": "~/.threads-cli/archive"
  },
  "settings": {
    "archive_after_publish": true,
    "default_limit": 25
  }
}
```

> **Security note:** `app_secret` and `access_token` are stored in **plaintext** in this file.
> The file is created with `0o600` permissions (owner read/write only), but anyone with access to
> your user account can read these credentials. Treat `~/.threads-cli/config.json` like any other
> secret, and run `threads auth logout` to clear the stored token when needed.

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
