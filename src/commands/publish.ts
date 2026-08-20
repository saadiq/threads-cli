import { Command } from "commander";
import { existsSync, renameSync, mkdirSync } from "fs";
import { resolve, basename, join } from "path";
import { loadConfig, expandPath } from "../lib/config";
import { parseDraft, validateDraft } from "../lib/drafts";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI, detectMediaType } from "../lib/api";
import { publishMedia } from "../lib/publish-media";
import { displayPreview, confirm } from "../utils/display";
import type { DraftFrontmatter, MediaItem, PostExtras } from "../lib/types";

function resolveMedia(fm: DraftFrontmatter): MediaItem[] {
  if (fm.images && fm.images.length > 0) {
    return fm.images.map((m) => {
      const upper = m.type?.toUpperCase();
      const type = upper === "IMAGE" || upper === "VIDEO" ? upper : detectMediaType(m.url);
      return { ...m, type };
    });
  }
  if (fm.video) {
    return [{ url: fm.video, type: "VIDEO", ...(fm.alt ? { alt: fm.alt } : {}) }];
  }
  if (fm.image) {
    return [{ url: fm.image, type: "IMAGE", ...(fm.alt ? { alt: fm.alt } : {}) }];
  }
  return [];
}

function resolveExtras(fm: DraftFrontmatter): PostExtras | undefined {
  const extras: PostExtras = {};
  if (fm.topic) extras.topicTag = fm.topic;
  if (fm.link) extras.linkAttachment = fm.link;
  if (fm.gif) extras.gif = { id: fm.gif };
  return extras.topicTag || extras.linkAttachment || extras.gif ? extras : undefined;
}

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
      const fm = draft.frontmatter;
      const media = resolveMedia(fm);
      const extras = resolveExtras(fm);

      const { valid, errors } = validateDraft(draft, media.length);

      if (!valid) {
        console.error("Validation errors:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      if (media.length > 0 && (fm.link || fm.gif)) {
        console.error("link/gif attachments are only allowed on text-only posts.");
        process.exit(1);
      }
      if (fm.topic && (fm.topic.length > 50 || /[.&]/.test(fm.topic))) {
        console.error("Topic tag must be 1-50 characters with no periods or ampersands.");
        process.exit(1);
      }

      // Display preview
      displayPreview(draft.content, media, extras);
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
        const postId = await publishMedia(api, draft.content, media, undefined, extras);

        // Get the post URL
        const post = await api.getPost(postId);

        console.log("\nPosted successfully");
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
