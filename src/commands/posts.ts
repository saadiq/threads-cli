import { Command } from "commander";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI, extractPostId } from "../lib/api";
import { loadConfig } from "../lib/config";
import { confirm } from "../utils/display";

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
    .option("-l, --limit <n>", "Posts per page (defaults to config default_limit; ignored with --since)")
    .option("--since <date>", "Fetch all posts since date (ISO format), paging as needed")
    .action(async (options) => {
      const config = loadConfig();
      const api = await requireAuth();
      const limit = parseInt(options.limit ?? String(config.settings.default_limit), 10);

      try {
        const posts = await api.getPosts({ limit, since: options.since });
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
    .command("delete <id>")
    .description("Delete a post by ID or URL")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (id: string, options) => {
      const resolvedId = extractPostId(id);

      if (!options.yes) {
        const confirmed = await confirm(`Delete post ${resolvedId}?`);
        if (!confirmed) {
          console.log("Cancelled.");
          return;
        }
      }

      const api = await requireAuth();

      try {
        await api.deletePost(resolvedId);
        console.log(`Deleted ${resolvedId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to delete post:", message);
        if (message.includes("permission")) {
          console.error(
            "Hint: if you authenticated before delete was supported, run 'threads auth login' again to grant the threads_delete scope."
          );
        }
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
