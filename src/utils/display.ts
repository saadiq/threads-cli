import type { MediaItem, PostExtras } from "../lib/types";

export function displayPreview(content: string, media: MediaItem[] = [], extras?: PostExtras): void {
  const width = 60;
  const inner = width - 2;
  const border = "─".repeat(width);
  const line = (text: string) => console.log(`│ ${text.slice(0, inner).padEnd(inner)} │`);
  const blank = () => console.log(`│ ${" ".repeat(inner)} │`);

  console.log(`┌${border}┐`);
  line("Preview");
  console.log(`├${border}┤`);

  for (const raw of content.split("\n")) {
    for (const chunk of chunkString(raw, inner)) line(chunk);
  }

  if (media.length >= 2) {
    blank();
    line(`Carousel (${media.length} items):`);
    media.forEach((m, k) => {
      const type = m.type ?? "IMAGE";
      line(`  [${k + 1}] ${type} ${m.url}${m.alt ? ` (alt: ${m.alt})` : ""}`);
    });
  } else if (media.length === 1) {
    blank();
    const m = media[0];
    line(`${(m.type ?? "IMAGE") === "VIDEO" ? "Video" : "Image"}: ${m.url}`);
    if (m.alt) line(`Alt: ${m.alt}`);
  }

  if (extras?.linkAttachment) line(`Link: ${extras.linkAttachment}`);
  if (extras?.gif) line(`GIF: ${extras.gif.id}`);
  if (extras?.topicTag) line(`Topic: ${extras.topicTag}`);

  blank();
  line(`Characters: ${content.length} / 500`);
  console.log(`└${border}┘`);
}

function chunkString(str: string, length: number): string[] {
  if (str.length <= length) return [str];
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}

export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);

  const response = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setRawMode?.(false);
    process.stdin.once("data", (chunk) => {
      data = chunk.toString().trim().toLowerCase();
      resolve(data);
    });
  });

  return response === "y" || response === "yes";
}
