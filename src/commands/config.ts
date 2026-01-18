import { Command } from "commander";

export function createConfigCommand(): Command {
  const config = new Command("config").description("Manage configuration");

  config
    .command("path")
    .description("Show config and drafts directory paths")
    .action(() => {
      console.log("TODO: Implement path");
    });

  config
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key: string, value: string) => {
      console.log(`TODO: Set ${key} to ${value}`);
    });

  return config;
}
