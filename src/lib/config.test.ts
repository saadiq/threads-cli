import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, getConfigPath, DEFAULT_CONFIG } from "./config";
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
});
