import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";
import type { Draft, DraftFrontmatter } from "./types";

export const DRAFT_CHAR_LIMIT = 500;
export const DRAFT_LINK_LIMIT = 5;

export function countLinks(text: string): number {
  return text.match(/https?:\/\/\S+/g)?.length ?? 0;
}

export function parseDraft(filePath: string): Draft {
  const content = readFileSync(filePath, "utf-8");
  const { data, content: body } = matter(content);
  return {
    frontmatter: data as DraftFrontmatter,
    content: body.trim(),
    filePath,
  };
}

export function createDraft(draftsDir: string, title?: string): string {
  const timestamp = new Date().toISOString();
  const slug = title
    ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)
    : `draft-${Date.now()}`;
  const filePath = join(draftsDir, `${slug}.md`);

  const frontmatter = [
    "---",
    title ? `title: "${title}"` : 'title: ""',
    `created: ${timestamp}`,
    "---",
    "",
    "",
  ].join("\n");

  writeFileSync(filePath, frontmatter);
  return filePath;
}

export function listDrafts(draftsDir: string): Draft[] {
  const files = readdirSync(draftsDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => parseDraft(join(draftsDir, f)));
}

export function validateDraft(draft: Draft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!draft.content || draft.content.trim().length === 0) {
    errors.push("Draft has no content");
  }

  if (draft.content.length > DRAFT_CHAR_LIMIT) {
    errors.push(`Content exceeds ${DRAFT_CHAR_LIMIT} characters (${draft.content.length})`);
  }

  const links = countLinks(draft.content);
  if (links >= DRAFT_LINK_LIMIT) {
    errors.push(
      `Contains ${links} links; Threads rejects posts with ${DRAFT_LINK_LIMIT}+ links (THREADS_API__LINK_LIMIT_EXCEEDED)`
    );
  }

  return { valid: errors.length === 0, errors };
}
