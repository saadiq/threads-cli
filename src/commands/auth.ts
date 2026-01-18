import { Command } from "commander";

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with Threads via browser")
    .action(() => {
      console.log("TODO: Implement login");
    });

  auth
    .command("logout")
    .description("Clear stored authentication")
    .action(() => {
      console.log("TODO: Implement logout");
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      console.log("TODO: Implement status");
    });

  return auth;
}
