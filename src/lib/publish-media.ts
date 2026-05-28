import type { ThreadsAPI } from "./api";
import type { MediaItem, PostExtras } from "./types";

export function publishMedia(
  api: ThreadsAPI,
  text: string,
  media: MediaItem[],
  replyToId?: string,
  extras?: PostExtras
): Promise<string> {
  if (media.length >= 2) {
    return api.createCarouselPost(text, media, replyToId, extras);
  }
  if (media.length === 1) {
    const item = media[0];
    return item.type === "VIDEO"
      ? api.createVideoPost(text, item.url, replyToId, item.alt, extras)
      : api.createImagePost(text, item.url, replyToId, item.alt, extras);
  }
  return api.createTextPost(text, replyToId, extras);
}
