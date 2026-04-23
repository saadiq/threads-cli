import type { ThreadsPost, ThreadsProfile, ThreadsInsights, PostMetrics } from "./types";

const BASE_URL = "https://graph.threads.net/v1.0";
const CONTAINER_POLL_TIMEOUT_MS = 60_000;
const CONTAINER_POLL_INTERVAL_MS = 2_000;

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
    const fields = "id,username,name,threads_profile_picture_url,threads_biography";
    const data = await this.fetch<any>(`/me?fields=${fields}`);
    return {
      id: data.id,
      username: data.username,
      name: data.name,
      bio: data.threads_biography,
      threads_profile_picture_url: data.threads_profile_picture_url,
    };
  }

  async getFollowerCount(): Promise<number> {
    const data = await this.fetch<any>(`/me/threads_insights?metric=followers_count`);
    const metric = data.data?.find((m: any) => m.name === "followers_count");
    return metric?.total_value?.value || 0;
  }

  async getInsights(): Promise<ThreadsInsights> {
    const profile = await this.getProfile();
    const followers_count = await this.getFollowerCount().catch(() => null);
    return { ...profile, followers_count };
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
    const metrics = "views,likes,replies,reposts,quotes,shares,clicks";
    const data = await this.fetch<any>(`/${postId}/insights?metric=${metrics}`);

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
    const data = await this.fetch<any>(`/${id}/replies?fields=${fields}`);

    return (data.data || []).map((reply: any) => ({
      id: reply.id,
      text: reply.text || "",
      created_at: reply.timestamp,
      url: reply.permalink,
    }));
  }

  private async waitForContainer(
    containerId: string,
    options: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? CONTAINER_POLL_TIMEOUT_MS;
    const intervalMs = options.intervalMs ?? CONTAINER_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    while (true) {
      const { status, error_message } = await this.fetch<{ status?: string; error_message?: string }>(
        `/${containerId}?fields=status,error_message`
      );
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`Threads container ${status}: ${error_message ?? "no error message"}`);
      }
      if (Date.now() + intervalMs > deadline) {
        const elapsedMs = Date.now() - startedAt;
        throw new Error(`Threads container not ready after ${elapsedMs}ms (timeout ${timeoutMs}ms, status=${status ?? "unknown"})`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  private async createAndPublish(params: Record<string, string>): Promise<string> {
    const containerData = await this.fetch<{ id: string }>(`/${this.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });

    await this.waitForContainer(containerData.id);

    const publishData = await this.fetch<{ id: string }>(`/${this.userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerData.id }),
    });

    return publishData.id;
  }

  async deletePost(postId: string): Promise<void> {
    const id = extractPostId(postId);
    await this.fetch<unknown>(`/${id}`, { method: "DELETE" });
  }

  async createTextPost(text: string, replyToId?: string): Promise<string> {
    const params: Record<string, string> = { media_type: "TEXT", text };
    if (replyToId) {
      params.reply_to_id = replyToId;
    }
    return this.createAndPublish(params);
  }

  async createImagePost(
    text: string,
    imageUrl: string,
    replyToId?: string,
    altText?: string
  ): Promise<string> {
    const params: Record<string, string> = { media_type: "IMAGE", image_url: imageUrl, text };
    if (replyToId) {
      params.reply_to_id = replyToId;
    }
    if (altText) {
      params.alt_text = altText;
    }
    return this.createAndPublish(params);
  }
}
