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

const FRONTMATTER_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Thread files use `---` both as a frontmatter fence and as the post separator,
 * so a leading block only counts as frontmatter when it parses as a YAML mapping
 * whose keys look like frontmatter fields. A scalar, a list, prose that happens
 * to contain a colon, or malformed YAML is really the first post: return the
 * text untouched instead of swallowing it (or throwing a YAMLException).
 */
export function stripFrontmatter(raw: string): string {
  try {
    const { data, content } = matter(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return raw;
    if (!Object.keys(data).every((k) => FRONTMATTER_KEY.test(k))) return raw;
    return content;
  } catch {
    return raw;
  }
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

export function validateDraft(draft: Draft, hasMedia = false): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!hasMedia && (!draft.content || draft.content.trim().length === 0)) {
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
