import type { ThreadsPost, ThreadsProfile, ThreadsInsights, PostMetrics, MediaItem, PostExtras } from "./types";
import {
  createTextPost,
  createImagePost,
  createVideoPost,
  createCarouselPost,
} from "./api-publish";

const BASE_URL = "https://graph.threads.net/v1.0";
// Cap concurrent per-post metric requests so a large `--since` range can't burst hundreds of
// calls at once (which would trip Threads rate limits and silently drop metrics).
const METRICS_CONCURRENCY = 8;
// When paging through `--since`, request the API's max page size to minimize the (necessarily
// sequential) round-trips. `--limit` only sizes a single page, so it's not used in this mode.
const SINCE_PAGE_SIZE = 100;
// Hard ceiling on `--since` pagination. Termination normally comes from the API dropping the
// `after` cursor on the last page; this is defensive insurance against a cursor that never
// clears (or repeats), which would otherwise loop forever fanning out a metric request per post.
const SINCE_MAX_PAGES = 100;

// Runs fn over items with at most `limit` in flight at once, preserving input order.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function extractPostId(idOrUrl: string): string {
  const urlMatch = idOrUrl.match(/threads\.net\/@[\w.]+\/post\/(\w+)/);
  return urlMatch ? urlMatch[1] : idOrUrl;
}

export function detectMediaType(url: string): "IMAGE" | "VIDEO" {
  return /\.(mp4|mov|m4v)([?#/]|$)/i.test(url) ? "VIDEO" : "IMAGE";
}

type Demographics = NonNullable<ThreadsInsights["demographics"]>;

// Maps a raw Graph API post object (using its field names) to our ThreadsPost shape.
function toThreadsPost(raw: any, metrics?: PostMetrics): ThreadsPost {
  return {
    id: raw.id,
    text: raw.text || "",
    created_at: raw.timestamp,
    url: raw.permalink,
    media_type: raw.media_type,
    media_url: raw.media_url,
    metrics,
  };
}

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
    // These three calls are independent; fetch them in parallel.
    const [profile, followers_count, demographics] = await Promise.all([
      this.getProfile(),
      this.getFollowerCount().catch(() => null),
      this.getFollowerDemographics().catch(() => ({})),
    ]);
    const insights: ThreadsInsights = { ...profile, followers_count };
    if (Object.keys(demographics).length > 0) {
      insights.demographics = demographics;
    }
    return insights;
  }

  // With `since` (ISO date), pages through the API's cursors to gather every matching post;
  // without it, returns a single page of up to `limit`. Metrics are fetched concurrently.
  async getPosts(options: { limit?: number; since?: string } = {}): Promise<ThreadsPost[]> {
    const { limit = 25, since } = options;
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const pageSize = since ? SINCE_PAGE_SIZE : limit;

    const raw: any[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const params = new URLSearchParams({ fields, limit: String(pageSize) });
      if (since) params.set("since", since);
      if (after) params.set("after", after);

      const data = await this.request<any>(`/${this.userId}/threads?${params}`);
      const page = data.data || [];
      raw.push(...page);
      // Only paginate when filtering by date; otherwise a single page honors `limit`.
      const nextAfter = since && page.length > 0 ? data.paging?.cursors?.after : undefined;
      // Stop if the API stops advancing the cursor (or repeats it) or we hit the page ceiling.
      after = nextAfter && nextAfter !== after && ++pages < SINCE_MAX_PAGES ? nextAfter : undefined;
    } while (after);

    const selected = since ? raw : raw.slice(0, limit);
    return mapWithConcurrency(selected, METRICS_CONCURRENCY, async (post) => {
      const metrics = await this.getPostMetrics(post.id).catch(() => undefined);
      return toThreadsPost(post, metrics);
    });
  }

  async getPost(postId: string): Promise<ThreadsPost> {
    const id = extractPostId(postId);
    const fields = "id,text,timestamp,media_type,media_url,permalink";
    const data = await this.request<any>(`/${id}?fields=${fields}`);
    const metrics = await this.getPostMetrics(id).catch(() => undefined);

    return toThreadsPost(data, metrics);
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
