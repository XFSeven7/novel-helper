export type CopybookChapterMeta = {
  index: number;
  title: string;
  start: number;
  end: number;
};

export type CopybookMeta = {
  id: string;
  title: string;
  filename: string;
  importedAt: string;
  encoding: "utf-8" | "gbk";
  charCount: number;
  chapters: CopybookChapterMeta[];
};

export type CopybookIndexEntry = {
  id: string;
  title: string;
  filename: string;
  importedAt: string;
  charCount: number;
  chapterCount: number;
};

export type CopybookChapterStatus = "not_started" | "in_progress" | "completed";

export type CopybookChapterProgress = {
  draftText: string;
  cursorPos: number;
  status: CopybookChapterStatus;
  editedSourceText?: string;
};

export type CopybookProgressFile = {
  chapters: Record<string, CopybookChapterProgress>;
};

export const COPYBOOK_MAX_BYTES = 20 * 1024 * 1024;
export const CHAPTER_HEADING_RE = /^第[一二三四五六七八九十百千万零\d]+章[^\n]*/gm;
