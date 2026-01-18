import { Command } from "commander";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { resolve, basename } from "path";
import { loadConfig, expandPath } from "../lib/config";
import { createDraft, listDrafts } from "../lib/drafts";

export function createDraftCommand(): Command {
  const draft = new Command("draft").description("Manage draft posts");

  draft
    .command("new [title]")
    .description("Create a new draft")
    .action((title?: string) => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);

      if (!existsSync(draftsDir)) {
        mkdirSync(draftsDir, { recursive: true });
      }

      const filePath = createDraft(draftsDir, title);
      console.log(`Created draft: ${filePath}`);
    });

  draft
    .command("list")
    .description("List all drafts")
    .action(() => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);

      if (!existsSync(draftsDir)) {
        console.log("No drafts folder found.");
        return;
      }

      const drafts = listDrafts(draftsDir);
      if (drafts.length === 0) {
        console.log("No drafts found.");
        return;
      }

      for (const d of drafts) {
        const title = d.frontmatter.title || "(untitled)";
        const preview = d.content.slice(0, 50).replace(/\n/g, " ");
        console.log(`${basename(d.filePath)}`);
        console.log(`  Title: ${title}`);
        console.log(`  Preview: ${preview}${d.content.length > 50 ? "..." : ""}`);
        console.log();
      }
    });

  draft
    .command("delete <file>")
    .description("Delete a draft")
    .action((file: string) => {
      const config = loadConfig();
      const draftsDir = expandPath(config.paths.drafts);
      const filePath = resolve(draftsDir, file);

      if (!existsSync(filePath)) {
        console.error(`Draft not found: ${filePath}`);
        process.exit(1);
      }

      unlinkSync(filePath);
      console.log(`Deleted: ${filePath}`);
    });

  return draft;
}
