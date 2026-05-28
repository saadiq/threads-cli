import type { ThreadsPost, ThreadsProfile, ThreadsInsights, PostMetrics, MediaItem, PostExtras } from "./types";
import {
  createTextPost,
  createImagePost,
  createVideoPost,
  createCarouselPost,
} from "./api-publish";

const BASE_URL = "https://graph.threads.net/v1.0";

export function extractPostId(idOrUrl: string): string {
  const urlMatch = idOrUrl.match(/threads\.net\/@[\w.]+\/post\/(\w+)/);
  return urlMatch ? urlMatch[1] : idOrUrl;
}

export function detectMediaType(url: string): "IMAGE" | "VIDEO" {
  return /\.(mp4|mov|m4v)([?#/]|$)/i.test(url) ? "VIDEO" : "IMAGE";
}

type Demographics = NonNullable<ThreadsInsights["demographics"]>;

// follower_demographics responses nest the data under total_value.breakdowns[].results[],
// where each result pairs a dimension key (e.g. "US") with a count.
function parseDemographicBreakdown(data: any): Record<string, number> {
  const results = data?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  const out: Record<string, number> = {};
  for (const r of results) {
    const key = r?.dimension_values?.[0];
    if (typeof key === "string") out[key] = r?.value ?? 0;
  }
  return out;
}

export class ThreadsAPI {
  constructor(
    private accessToken: string,
    readonly userId: string
  ) {}

  /** Internal: shared Graph API request helper. Public so api-publish.ts helpers can reuse it. */
  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);

    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads API error: ${response.status} - ${error}`);
    }
    return response.json();
  }

  async getProfile(): Promise<ThreadsProfile> {
    const fields = "id,username,name,threads_profile_picture_url,threads_biography";
    const data = await this.request<any>(`/me?fields=${fields}`);
    return {
      id: data.id,
      username: data.username,
      name: data.name,
      bio: data.threads_biography,
      threads_profile_picture_url: data.threads_profile_picture_url,
    };
  }

  async getFollowerCount(): Promise<number> {
    const data = await this.request<any>(`/me/threads_insights?metric=followers_count`);
    const metric = data.data?.find((m: any) => m.name === "followers_count");
    return metric?.total_value?.value || 0;
  }

  // Fetches follower demographics. Threads requires one breakdown per request and 100+
  // followers; each breakdown degrades to omitted on error (too few followers / no linked IG).
  async getFollowerDemographics(): Promise<Demographics> {
    const breakdowns: Array<{ param: string; key: keyof Demographics }> = [
      { param: "country", key: "countries" },
      { param: "city", key: "cities" },
      { param: "age", key: "age" },
      { param: "gender", key: "gender" },
    ];

    const demographics: Demographics = {};
    await Promise.all(
      breakdowns.map(async ({ param, key }) => {
        const parsed = await this.request<any>(
          `/me/threads_insights?metric=follower_demographics&breakdown=${param}`
        )
          .then(parseDemographicBreakdown)
          .catch(() => undefined);
        if (parsed && Object.keys(parsed).length > 0) {
          demographics[key] = parsed;
        }
      })
    );
    return demographics;
  }

  async getInsights(): Promise<ThreadsInsights> {
    const profile = await this.getProfile();
    const followers_count = await this.getFollowerCount().catch(() => null);
    const demographics = await this.getFollowerDemographics().catch(() => ({}));
    const insights: ThreadsInsights = { ...profile, followers_count };
    if (Object.keys(demographics).length > 0) {
      insights.demographics = demographics;
    }
    return insights;
  }

  async getPosts(limit: number = 25): Promise<ThreadsPost[]> {
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.request<any>(
      `/${this.userId}/threads?fields=${fields}&limit=${limit}`
    );

    const posts: ThreadsPost[] = [];
    for (const post of data.data || []) {
      const metrics = await this.getPostMetrics(post.id).catch(() => undefined);
      posts.push({
        id: post.id,
        text: post.text || "",
        created_at: post.timestamp,
        url: post.permalink,
        media_type: post.media_type,
        media_url: post.media_url,
        metrics,
      });
    }
    return posts;
  }

  async getPost(postId: string): Promise<ThreadsPost> {
    const id = extractPostId(postId);
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.request<any>(`/${id}?fields=${fields}`);
    const metrics = await this.getPostMetrics(id).catch(() => undefined);

    return {
      id: data.id,
      text: data.text || "",
      created_at: data.timestamp,
      url: data.permalink,
      media_type: data.media_type,
      media_url: data.media_url,
      metrics,
    };
  }

  async getPostMetrics(postId: string): Promise<PostMetrics> {
    const metrics = "views,likes,replies,reposts,quotes,shares,clicks";
    const data = await this.request<any>(`/${postId}/insights?metric=${metrics}`);

    const result: PostMetrics = {
      views: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      shares: 0,
      clicks: 0,
    };
    for (const item of data.data || []) {
      const name = item.name as keyof PostMetrics;
      if (name in result) {
        result[name] = item.values?.[0]?.value || 0;
      }
    }
    return result;
  }

  async getReplies(postId: string): Promise<ThreadsPost[]> {
    const id = extractPostId(postId);
    const fields = "id,text,timestamp,username,permalink";
    const data = await this.request<any>(`/${id}/replies?fields=${fields}`);

    return (data.data || []).map((reply: any) => ({
      id: reply.id,
      text: reply.text || "",
      created_at: reply.timestamp,
      url: reply.permalink,
    }));
  }

  async deletePost(postId: string): Promise<void> {
    const id = extractPostId(postId);
    await this.request<unknown>(`/${id}`, { method: "DELETE" });
  }

  // Publishing — thin delegations to api-publish.ts (keeps this file under the 300-line limit).

  createTextPost(text: string, replyToId?: string, extras?: PostExtras): Promise<string> {
    return createTextPost(this, text, replyToId, extras);
  }

  createImagePost(
    text: string,
    imageUrl: string,
    replyToId?: string,
    altText?: string,
    extras?: PostExtras
  ): Promise<string> {
    return createImagePost(this, text, imageUrl, replyToId, altText, extras);
  }

  createVideoPost(
    text: string,
    videoUrl: string,
    replyToId?: string,
    altText?: string,
    extras?: PostExtras
  ): Promise<string> {
    return createVideoPost(this, text, videoUrl, replyToId, altText, extras);
  }

  createCarouselPost(
    text: string,
    items: MediaItem[],
    replyToId?: string,
    extras?: PostExtras
  ): Promise<string> {
    return createCarouselPost(this, text, items, replyToId, extras);
  }
}
