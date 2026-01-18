import { Command } from "commander";
import { getConfigPath, loadConfig, saveConfig, expandPath } from "../lib/config";

export function createConfigCommand(): Command {
  const config = new Command("config").description("Manage configuration");

  config
    .command("path")
    .description("Show config and drafts directory paths")
    .action(() => {
      const cfg = loadConfig();
      console.log(`Config file: ${getConfigPath()}`);
      console.log(`Drafts folder: ${expandPath(cfg.paths.drafts)}`);
      console.log(`Archive folder: ${expandPath(cfg.paths.archive)}`);
    });

  config
    .command("set <key> <value>")
    .description("Set a configuration value (drafts_path, archive_path, default_limit)")
    .action((key: string, value: string) => {
      const cfg = loadConfig();

      switch (key) {
        case "drafts_path":
          cfg.paths.drafts = value;
          break;
        case "archive_path":
          cfg.paths.archive = value;
          break;
        case "default_limit":
          cfg.settings.default_limit = parseInt(value, 10);
          break;
        case "archive_after_publish":
          cfg.settings.archive_after_publish = value === "true";
          break;
        default:
          console.error(`Unknown config key: ${key}`);
          console.error("Valid keys: drafts_path, archive_path, default_limit, archive_after_publish");
          process.exit(1);
      }

      saveConfig(cfg);
      console.log(`Set ${key} = ${value}`);
    });

  return config;
}
