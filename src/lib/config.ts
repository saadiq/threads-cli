import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "fs";
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

  let userConfig: Partial<Config>;
  try {
    userConfig = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse config file at ${configPath}: ${error instanceof Error ? error.message : "Invalid JSON"}`
    );
  }

  // Deep merge to preserve nested defaults when user only partially configures a section
  return {
    auth: { ...DEFAULT_CONFIG.auth, ...userConfig.auth },
    paths: { ...DEFAULT_CONFIG.paths, ...userConfig.paths },
    settings: { ...DEFAULT_CONFIG.settings, ...userConfig.settings },
  };
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
