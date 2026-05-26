import type { ChapterReaderCommentsFile, ReaderCommentThread } from "./types.js";

export function sortThreads(threads: ReaderCommentThread[]): ReaderCommentThread[] {
  return [...threads].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function normalizeCommentsFile(file: ChapterReaderCommentsFile): ChapterReaderCommentsFile {
  return { ...file, threads: sortThreads(file.threads) };
}

export function deleteThread(file: ChapterReaderCommentsFile, threadId: string): ChapterReaderCommentsFile {
  return normalizeCommentsFile({
    ...file,
    threads: file.threads.filter((t) => t.id !== threadId)
  });
}

export function setThreadPinned(
  file: ChapterReaderCommentsFile,
  threadId: string,
  pinned: boolean
): ChapterReaderCommentsFile {
  return normalizeCommentsFile({
    ...file,
    threads: file.threads.map((t) => {
      if (t.id !== threadId) return t;
      const next = { ...t };
      if (pinned) next.pinned = true;
      else delete next.pinned;
      return next;
    })
  });
}
