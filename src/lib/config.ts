import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import type { Config } from "./types";

export const DEFAULT_CONFIG: Config = {
  auth: {
    app_id: "",
    app_secret: "",
  },
  paths: {
    drafts: join(homedir(), ".threads-cli", "drafts"),
    archive: join(homedir(), ".threads-cli", "archive"),
  },
  settings: {
    archive_after_publish: true,
    default_limit: 25,
  },
};

export function getConfigDir(): string {
  return process.env.THREADS_CLI_CONFIG_DIR || join(homedir(), ".threads-cli");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  const content = readFileSync(configPath, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  chmodSync(configPath, 0o600);
}

export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
