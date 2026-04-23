import { Command } from "commander";
import { existsSync, renameSync, mkdirSync } from "fs";
import { resolve, basename, join } from "path";
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
          postId = await api.createImagePost(
            draft.content,
            draft.frontmatter.image,
            undefined,
            draft.frontmatter.alt
          );
        } else {
          postId = await api.createTextPost(draft.content);
        }

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
