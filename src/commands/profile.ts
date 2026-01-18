import { Command } from "commander";
import { getValidAccessToken } from "../lib/auth";
import { ThreadsAPI } from "../lib/api";

export function createProfileCommand(): Command {
  const profile = new Command("profile")
    .description("View your profile info")
    .option("--insights", "Include follower demographics")
    .action(async (options) => {
      const auth = await getValidAccessToken();
      if (!auth) {
        console.error("Not authenticated. Run 'threads auth login' first.");
        process.exit(1);
      }

      const api = new ThreadsAPI(auth.token, auth.userId);

      try {
        const data = options.insights
          ? await api.getInsights()
          : await api.getProfile();

        // Add follower count
        const followersCount = await api.getFollowerCount();
        const result = { ...data, followers_count: followersCount };

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        process.exit(1);
      }
    });

  return profile;
}
