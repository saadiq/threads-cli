import { Command } from "commander";

export function createDraftCommand(): Command {
  const draft = new Command("draft").description("Manage draft posts");

  draft
    .command("new [title]")
    .description("Create a new draft")
    .action((title?: string) => {
      console.log(`TODO: Create draft with title: ${title}`);
    });

  draft
    .command("list")
    .description("List all drafts")
    .action(() => {
      console.log("TODO: List drafts");
    });

  draft
    .command("delete <file>")
    .description("Delete a draft")
    .action((file: string) => {
      console.log(`TODO: Delete ${file}`);
    });

  return draft;
}
