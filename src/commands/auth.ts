import { Command } from "commander";
import { createServer } from "http";
import { loadConfig, saveConfig } from "../lib/config";
import { getAuthUrl, exchangeCodeForToken, getValidAccessToken } from "../lib/auth";
import * as readline from "readline";

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with Threads via browser")
    .action(async () => {
      const config = loadConfig();

      // Check if app credentials exist
      if (!config.auth.app_id || !config.auth.app_secret) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const question = (q: string): Promise<string> =>
          new Promise((resolve) => rl.question(q, resolve));

        console.log("\nNo app credentials found. Let's set them up.\n");
        console.log("1. Go to https://developers.facebook.com/apps");
        console.log("2. Create a new app with Threads API access");
        console.log("3. Add http://localhost:3000/callback as a redirect URI\n");

        config.auth.app_id = await question("Meta App ID: ");
        config.auth.app_secret = await question("Meta App Secret: ");

        const draftsPath = await question(
          `Drafts folder [${config.paths.drafts}]: `
        );
        if (draftsPath) config.paths.drafts = draftsPath;

        const archivePath = await question(
          `Archive folder [${config.paths.archive}]: `
        );
        if (archivePath) config.paths.archive = archivePath;

        rl.close();
        saveConfig(config);
      }

      // Start local server for callback
      const authUrl = getAuthUrl(config.auth.app_id);

      console.log("\nOpening browser for authorization...");
      console.log(`If browser doesn't open, visit: ${authUrl}\n`);

      // Open browser
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      Bun.spawn([openCmd, authUrl]);

      // Wait for callback
      const code = await new Promise<string>((resolve, reject) => {
        const server = createServer((req, res) => {
          const url = new URL(req.url!, `http://localhost:3000`);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Authorization failed</h1><p>You can close this tab.</p>");
            server.close();
            reject(new Error(error));
            return;
          }

          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>");
            server.close();
            resolve(code);
          }
        });

        server.listen(3000, () => {
          console.log("Waiting for authorization...");
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          server.close();
          reject(new Error("Authorization timed out"));
        }, 5 * 60 * 1000);
      });

      // Exchange code for token
      console.log("Exchanging code for access token...");
      const { accessToken, userId } = await exchangeCodeForToken(
        code,
        config.auth.app_id,
        config.auth.app_secret
      );

      // Save tokens
      config.auth.access_token = accessToken;
      config.auth.user_id = userId;
      config.auth.expires_at = new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      ).toISOString(); // 60 days
      saveConfig(config);

      console.log("\n✓ Successfully authenticated!");
      console.log(`  User ID: ${userId}`);
    });

  auth
    .command("logout")
    .description("Clear stored authentication")
    .action(() => {
      const config = loadConfig();
      delete config.auth.access_token;
      delete config.auth.refresh_token;
      delete config.auth.user_id;
      delete config.auth.expires_at;
      saveConfig(config);
      console.log("Logged out successfully.");
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(async () => {
      const config = loadConfig();

      if (!config.auth.app_id) {
        console.log("Status: Not configured");
        console.log("Run 'threads auth login' to set up.");
        return;
      }

      const auth = await getValidAccessToken();
      if (!auth) {
        console.log("Status: Not authenticated");
        console.log("Run 'threads auth login' to authenticate.");
        return;
      }

      console.log("Status: Authenticated");
      console.log(`User ID: ${auth.userId}`);
      if (config.auth.expires_at) {
        const expires = new Date(config.auth.expires_at);
        console.log(`Token expires: ${expires.toLocaleDateString()}`);
      }
    });

  return auth;
}
