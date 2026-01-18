import { Command } from "commander";

export function createProfileCommand(): Command {
  const profile = new Command("profile")
    .description("View your profile info")
    .option("--insights", "Include follower demographics")
    .action((options) => {
      console.log(`TODO: Show profile, insights: ${options.insights}`);
    });

  return profile;
}
