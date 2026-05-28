import type { ThreadsAPI } from "./api";
import { detectMediaType } from "./api";
import type { MediaItem, PostExtras } from "./types";

const CONTAINER_POLL_TIMEOUT_MS = 60_000;
const VIDEO_POLL_TIMEOUT_MS = 300_000;
const CONTAINER_POLL_INTERVAL_MS = 2_000;
const CAROUSEL_MIN_ITEMS = 2;
const CAROUSEL_MAX_ITEMS = 20;

export async function waitForContainer(
  api: ThreadsAPI,
  containerId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? CONTAINER_POLL_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? CONTAINER_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  while (true) {
    const { status, error_message } = await api.request<{ status?: string; error_message?: string }>(
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

async function createContainer(api: ThreadsAPI, params: Record<string, string>): Promise<string> {
  const data = await api.request<{ id: string }>(`/${api.userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return data.id;
}

async function publishContainer(api: ThreadsAPI, creationId: string): Promise<string> {
  const data = await api.request<{ id: string }>(`/${api.userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: creationId }),
  });
  return data.id;
}

async function createAndPublish(
  api: ThreadsAPI,
  params: Record<string, string>,
  waitOptions?: { timeoutMs?: number; intervalMs?: number }
): Promise<string> {
  const containerId = await createContainer(api, params);
  await waitForContainer(api, containerId, waitOptions);
  return publishContainer(api, containerId);
}

function applyExtras(
  params: Record<string, string>,
  extras?: PostExtras,
  allowTextOnly = false
): void {
  if (!extras) return;
  if (extras.topicTag) {
    params.topic_tag = extras.topicTag;
  }
  if (allowTextOnly) {
    if (extras.linkAttachment) {
      params.link_attachment = extras.linkAttachment;
    }
    if (extras.gif) {
      params.gif_attachment = JSON.stringify({
        gif_id: extras.gif.id,
        provider: extras.gif.provider ?? "giphy",
      });
    }
  }
}

export async function createTextPost(
  api: ThreadsAPI,
  text: string,
  replyToId?: string,
  extras?: PostExtras
): Promise<string> {
  const params: Record<string, string> = { media_type: "TEXT", text };
  if (replyToId) {
    params.reply_to_id = replyToId;
  }
  applyExtras(params, extras, true);
  return createAndPublish(api, params);
}

// IMAGE and VIDEO posts differ only by the media_type, the URL param name, and the
// (longer) poll timeout videos need — everything else is identical.
async function createSingleMediaPost(
  api: ThreadsAPI,
  mediaType: "IMAGE" | "VIDEO",
  url: string,
  text: string,
  replyToId?: string,
  altText?: string,
  extras?: PostExtras
): Promise<string> {
  const urlParam = mediaType === "VIDEO" ? "video_url" : "image_url";
  const params: Record<string, string> = { media_type: mediaType, [urlParam]: url, text };
  if (replyToId) {
    params.reply_to_id = replyToId;
  }
  if (altText) {
    params.alt_text = altText;
  }
  applyExtras(params, extras);
  const waitOptions = mediaType === "VIDEO" ? { timeoutMs: VIDEO_POLL_TIMEOUT_MS } : undefined;
  return createAndPublish(api, params, waitOptions);
}

export function createImagePost(
  api: ThreadsAPI,
  text: string,
  imageUrl: string,
  replyToId?: string,
  altText?: string,
  extras?: PostExtras
): Promise<string> {
  return createSingleMediaPost(api, "IMAGE", imageUrl, text, replyToId, altText, extras);
}

export function createVideoPost(
  api: ThreadsAPI,
  text: string,
  videoUrl: string,
  replyToId?: string,
  altText?: string,
  extras?: PostExtras
): Promise<string> {
  return createSingleMediaPost(api, "VIDEO", videoUrl, text, replyToId, altText, extras);
}

export async function createCarouselPost(
  api: ThreadsAPI,
  text: string,
  items: MediaItem[],
  replyToId?: string,
  extras?: PostExtras
): Promise<string> {
  if (items.length < CAROUSEL_MIN_ITEMS || items.length > CAROUSEL_MAX_ITEMS) {
    throw new Error(
      `Carousel requires ${CAROUSEL_MIN_ITEMS}-${CAROUSEL_MAX_ITEMS} items (got ${items.length})`
    );
  }

  const childIds: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const type = item.type ?? detectMediaType(item.url);
    const childParams: Record<string, string> = {
      media_type: type,
      is_carousel_item: "true",
    };
    if (type === "VIDEO") {
      childParams.video_url = item.url;
    } else {
      childParams.image_url = item.url;
    }
    if (item.alt) {
      childParams.alt_text = item.alt;
    }

    const childId = await createContainer(api, childParams);
    try {
      await waitForContainer(
        api,
        childId,
        type === "VIDEO" ? { timeoutMs: VIDEO_POLL_TIMEOUT_MS } : undefined
      );
    } catch (error) {
      throw new Error(`Carousel item ${i + 1} (${item.url}) failed: ${(error as Error).message}`);
    }
    childIds.push(childId);
  }

  const params: Record<string, string> = {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    text,
  };
  if (replyToId) {
    params.reply_to_id = replyToId;
  }
  applyExtras(params, extras);
  return createAndPublish(api, params);
}
