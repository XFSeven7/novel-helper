import type { CopybookChapterMeta } from "./types.js";
import { CHAPTER_HEADING_RE } from "./types.js";

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function parseChapters(text: string): CopybookChapterMeta[] {
  const normalized = normalizeNewlines(text);
  const matches = [...normalized.matchAll(CHAPTER_HEADING_RE)];
  if (matches.length === 0) {
    return [{ index: 0, title: "全文", start: 0, end: normalized.length }];
  }
  const chapters: CopybookChapterMeta[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = i === 0 ? 0 : m.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : normalized.length;
    chapters.push({
      index: i,
      title: m[0].trim(),
      start,
      end
    });
  }
  return chapters;
}
