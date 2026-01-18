import type { ThreadsPost, ThreadsProfile, ThreadsInsights, PostMetrics } from "./types";

const BASE_URL = "https://graph.threads.net/v1.0";

export function extractPostId(idOrUrl: string): string {
  const urlMatch = idOrUrl.match(/threads\.net\/@[\w.]+\/post\/(\w+)/);
  return urlMatch ? urlMatch[1] : idOrUrl;
}

export class ThreadsAPI {
  constructor(
    private accessToken: string,
    private userId: string
  ) {}

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
    const fields = "id,username,threads_profile_picture_url,threads_biography";
    const data = await this.fetch<any>(`/me?fields=${fields}`);
    return {
      id: data.id,
      username: data.username,
      bio: data.threads_biography,
      followers_count: 0, // Fetched separately
      threads_profile_picture_url: data.threads_profile_picture_url,
    };
  }

  async getFollowerCount(): Promise<number> {
    const data = await this.fetch<any>(`/me?fields=followers_count`);
    return data.followers_count || 0;
  }

  async getInsights(): Promise<ThreadsInsights> {
    const profile = await this.getProfile();
    const followersCount = await this.getFollowerCount();
    return { ...profile, followers_count: followersCount };
  }

  async getPosts(limit: number = 25): Promise<ThreadsPost[]> {
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.fetch<any>(
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
    const data = await this.fetch<any>(`/${id}?fields=${fields}`);
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
    const metrics = "views,likes,replies,reposts,quotes";
    const data = await this.fetch<any>(`/${postId}/insights?metric=${metrics}`);

    const result: PostMetrics = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 };
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
    const data = await this.fetch<any>(`/${id}/replies?fields=${fields}`);

    return (data.data || []).map((reply: any) => ({
      id: reply.id,
      text: reply.text || "",
      created_at: reply.timestamp,
      url: reply.permalink,
    }));
  }

  async createTextPost(text: string): Promise<string> {
    // Step 1: Create container
    const containerData = await this.fetch<any>(`/${this.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "TEXT", text }),
    });

    const containerId = containerData.id;

    // Step 2: Publish
    const publishData = await this.fetch<any>(`/${this.userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId }),
    });

    return publishData.id;
  }

  async createImagePost(text: string, imageUrl: string): Promise<string> {
    // Step 1: Create container with image
    const containerData = await this.fetch<any>(`/${this.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "IMAGE", image_url: imageUrl, text }),
    });

    const containerId = containerData.id;

    // Step 2: Publish
    const publishData = await this.fetch<any>(`/${this.userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId }),
    });

    return publishData.id;
  }
}
