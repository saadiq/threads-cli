import { Command } from "commander";
import { existsSync, readFileSync, renameSync, mkdirSync } from "fs";
import { basename, join, resolve } from "path";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI, detectMediaType } from "../lib/api";
import { publishMedia } from "../lib/publish-media";
import { loadConfig, expandPath } from "../lib/config";
import type { ThreadPost, MediaItem } from "../lib/types";
import { countLinks, DRAFT_LINK_LIMIT } from "../lib/drafts";
import { confirm } from "../utils/display";

const RATE_LIMIT_DELAY_MS = 1000;
// Leading image markdown: ![alt](url), optionally followed by content on the same line.
const IMAGE_LINE = /^!\[(.*?)\]\((.*?)\)\s*(.*)$/;

function parseThreadFile(filePath: string): ThreadPost[] {
  const raw = readFileSync(filePath, "utf-8");

  // Split by --- on its own line (thread separator)
  const parts = raw.split(/\n---\n/).map((p) => p.trim()).filter(Boolean);

  return parts.map((part) => {
    // Consume contiguous leading image lines; trailing text ends the run.
    const lines = part.split("\n");
    const media: MediaItem[] = [];
    const contentLines: string[] = [];
    let inMedia = true;
    for (const lineText of lines) {
      const match = inMedia ? lineText.match(IMAGE_LINE) : null;
      if (match) {
        const url = match[2].trim();
        const alt = match[1].trim();
        media.push({ url, type: detectMediaType(url), ...(alt ? { alt } : {}) });
        const trailing = match[3].trim();
        if (trailing) {
          contentLines.push(trailing);
          inMedia = false;
        }
        continue;
      }
      inMedia = false;
      contentLines.push(lineText);
    }
    const content = contentLines.join("\n").trim();

    return media.length > 0 ? { content, images: media } : { content };
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

      for (let i = 0; i < posts.length; i++) {
        const links = countLinks(posts[i].content);
        if (links >= DRAFT_LINK_LIMIT) {
          console.error(
            `Post ${i + 1} contains ${links} links; Threads rejects posts with ${DRAFT_LINK_LIMIT}+ links (THREADS_API__LINK_LIMIT_EXCEEDED)`
          );
          process.exit(1);
        }
        const mediaCount = posts[i].images?.length ?? 0;
        if (mediaCount > 20) {
          console.error(`Post ${i + 1} has ${mediaCount} media items; carousels allow at most 20.`);
          process.exit(1);
        }
      }

      // Display preview
      console.log(`\n📝 Thread Preview (${posts.length} posts):\n`);
      posts.forEach((post, i) => {
        const media = post.images ?? [];
        let badge = "";
        if (media.length >= 2) badge = `🖼️x${media.length}`;
        else if (media.length === 1) badge = media[0].type === "VIDEO" ? "🎬" : "📷";
        console.log(`--- Post ${i + 1} ${badge} ---`);
        console.log(post.content);
        media.forEach((m, k) => {
          console.log(`  [${k + 1}] ${m.url}${m.alt ? ` (alt: ${m.alt})` : ""}`);
        });
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

          const postId = await publishMedia(api, post.content, post.images ?? [], previousPostId);

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
