import { Command } from "commander";

export function createPostsCommand(): Command {
  const posts = new Command("posts").description("Fetch and view posts");

  posts
    .command("list")
    .description("List your recent posts")
    .option("-l, --limit <n>", "Number of posts", "25")
    .option("--since <date>", "Filter posts since date")
    .action((options) => {
      console.log(`TODO: List posts with limit ${options.limit}`);
    });

  posts
    .command("get <id>")
    .description("Get a specific post by ID or URL")
    .action((id: string) => {
      console.log(`TODO: Get post ${id}`);
    });

  posts
    .command("replies <id>")
    .description("Get replies to a post")
    .action((id: string) => {
      console.log(`TODO: Get replies for ${id}`);
    });

  return posts;
}
