import { Command } from "commander";

export function createPublishCommand(): Command {
  const publish = new Command("publish")
    .description("Publish a draft to Threads")
    .argument("<file>", "Path to markdown draft file")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Preview only, don't post")
    .action((file: string, options) => {
      console.log(`TODO: Publish ${file}, yes: ${options.yes}, dryRun: ${options.dryRun}`);
    });

  return publish;
}
