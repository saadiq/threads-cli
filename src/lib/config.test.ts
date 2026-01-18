import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, getConfigPath, DEFAULT_CONFIG, expandPath } from "./config";
import { homedir } from "os";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_CONFIG_DIR = join(import.meta.dir, "../../.test-config");

describe("config", () => {
  beforeEach(() => {
    process.env.THREADS_CLI_CONFIG_DIR = TEST_CONFIG_DIR;
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    delete process.env.THREADS_CLI_CONFIG_DIR;
  });

  test("getConfigPath returns correct path", () => {
    const path = getConfigPath();
    expect(path).toBe(join(TEST_CONFIG_DIR, "config.json"));
  });

  test("loadConfig returns default config when file doesn't exist", () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("saveConfig and loadConfig round-trip", () => {
    const config = {
      ...DEFAULT_CONFIG,
      auth: { ...DEFAULT_CONFIG.auth, app_id: "test-app-id" },
    };
    saveConfig(config);
    const loaded = loadConfig();
    expect(loaded.auth.app_id).toBe("test-app-id");
  });

  test("loadConfig deep merges partial user config with defaults", () => {
    // Save config with only partial settings (missing default_limit)
    const partialConfig = {
      auth: { app_id: "my-app" },
      settings: { archive_after_publish: false },
    };
    const { writeFileSync } = require("fs");
    writeFileSync(getConfigPath(), JSON.stringify(partialConfig));

    const loaded = loadConfig();

    // User values should be applied
    expect(loaded.auth.app_id).toBe("my-app");
    expect(loaded.settings.archive_after_publish).toBe(false);

    // Defaults should be preserved for missing nested values
    expect(loaded.auth.app_secret).toBe("");
    expect(loaded.settings.default_limit).toBe(25);
    expect(loaded.paths.drafts).toBe(DEFAULT_CONFIG.paths.drafts);
    expect(loaded.paths.archive).toBe(DEFAULT_CONFIG.paths.archive);
  });

  test("loadConfig throws helpful error for invalid JSON", () => {
    const { writeFileSync } = require("fs");
    writeFileSync(getConfigPath(), "{ invalid json }");

    expect(() => loadConfig()).toThrow(/Failed to parse config file/);
  });
});

describe("expandPath", () => {
  test("expands ~ to home directory", () => {
    const expanded = expandPath("~/Documents/test.txt");
    expect(expanded).toBe(join(homedir(), "Documents/test.txt"));
  });

  test("returns absolute paths unchanged", () => {
    const absolutePath = "/usr/local/bin/test";
    expect(expandPath(absolutePath)).toBe(absolutePath);
  });

  test("returns relative paths unchanged", () => {
    const relativePath = "relative/path/file.txt";
    expect(expandPath(relativePath)).toBe(relativePath);
  });
});
