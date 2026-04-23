import { Command } from "commander";
import { existsSync, readFileSync, renameSync, mkdirSync } from "fs";
import { basename, join, resolve } from "path";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI } from "../lib/api";
import { loadConfig, expandPath } from "../lib/config";
import type { ThreadPost } from "../lib/types";
import { confirm } from "../utils/display";

const RATE_LIMIT_DELAY_MS = 1000;

function parseThreadFile(filePath: string): ThreadPost[] {
  const raw = readFileSync(filePath, "utf-8");

  // Split by --- on its own line (thread separator)
  const parts = raw.split(/\n---\n/).map((p) => p.trim()).filter(Boolean);

  return parts.map((part) => {
    // Check for simple image syntax: ![alt](url) at start
    const imageMatch = part.match(/^!\[(.*?)\]\((.*?)\)\n*/);
    if (imageMatch) {
      const alt = imageMatch[1].trim();
      return {
        content: part.replace(imageMatch[0], "").trim(),
        image: imageMatch[2],
        ...(alt ? { alt } : {}),
      };
    }
    return { content: part };
  });
}

export function createThreadCommand(): Command {
  const thread = new Command("thread")
    .description("Publish a thread (multiple connected posts)")
    .argument("<file>", "Path to thread file (posts separated by ---)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Preview only, don't post")
    .action(async (file: string, options) => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);
      const filePath = file.startsWith("/") ? file : resolve(draftsDir, file);

      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      // Parse thread posts
      const posts = parseThreadFile(filePath);

      if (posts.length === 0) {
        console.error("No posts found in thread file");
        process.exit(1);
      }

      if (posts.length === 1) {
        console.error("Thread must have at least 2 posts. Use 'publish' for single posts.");
        process.exit(1);
      }

      // Display preview
      console.log(`\n📝 Thread Preview (${posts.length} posts):\n`);
      posts.forEach((post, i) => {
        console.log(`--- Post ${i + 1} ${post.image ? "📷" : ""} ---`);
        console.log(post.content);
        if (post.image) {
          console.log(`\n  Image: ${post.image}`);
        }
        console.log();
      });

      // Dry run stops here
      if (options.dryRun) {
        console.log("Dry run - not posting.");
        return;
      }

      // Confirm unless --yes
      if (!options.yes) {
        const confirmed = await confirm(`Publish ${posts.length}-post thread to Threads?`);
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

      // Publish thread
      try {
        const postedUrls: string[] = [];
        let previousPostId: string | undefined;

        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          console.log(`Publishing post ${i + 1}/${posts.length}...`);

          const postId = post.image
            ? await api.createImagePost(post.content, post.image, previousPostId, post.alt)
            : await api.createTextPost(post.content, previousPostId);

          const posted = await api.getPost(postId);
          postedUrls.push(posted.url);
          previousPostId = postId;

          if (i < posts.length - 1) {
            await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
          }
        }

        console.log("\n✅ Thread posted successfully!\n");
        postedUrls.forEach((url, i) => {
          console.log(`  Post ${i + 1}: ${url}`);
        });

        // Archive if configured
        if (config.settings.archive_after_publish) {
          const archiveDir = expandPath(config.paths.archive);
          mkdirSync(archiveDir, { recursive: true });
          const archivePath = join(archiveDir, basename(filePath));
          renameSync(filePath, archivePath);
          console.log(`\n  Archived to: ${archivePath}`);
        }
      } catch (error) {
        console.error("Failed to publish thread:", error);
        process.exit(1);
      }
    });

  return thread;
}
