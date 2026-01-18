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
        // getInsights already includes followers_count
        if (options.insights) {
          const data = await api.getInsights();
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        // For basic profile, fetch followers_count separately (may fail without linked Instagram)
        const profile = await api.getProfile();
        const followersCount = await api.getFollowerCount().catch(() => null);
        console.log(JSON.stringify({ ...profile, followers_count: followersCount }, null, 2));
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        process.exit(1);
      }
    });

  return profile;
}
