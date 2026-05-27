import { readChapter, readStoryFile, readTimelineIndex } from "../fsStore.js";
import { truncateForPrompt } from "../prompts/index.js";

function buildCoarseFromTimeline(tl: {
  compressedRanges?: unknown[];
  events?: unknown[];
  chapters?: unknown[];
}): string {
  const ranges = Array.isArray(tl?.compressedRanges) ? tl.compressedRanges : [];
  const events = Array.isArray(tl?.events) ? tl.events : [];
  const chapters = Array.isArray(tl?.chapters) ? tl.chapters : [];

  const topRanges = [...ranges]
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 12)
    .map((r: any) => `- 第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter(Boolean);

  if (topRanges.length) {
    return truncateForPrompt(["【多章压缩摘要（最粗粒度）】", ...topRanges].join("\n"), 12_000);
  }

  const topEvents = [...events]
    .filter((e: any) => String(e?.status ?? "open") !== "done")
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 12)
    .map(
      (e: any) =>
        `- 第${e.startChapter}-${e.endChapter}章·${String(e.title || "").trim() || "事件"}：${String(e.summary || "").trim()}`
    )
    .filter(Boolean);

  const lastChapters = [...chapters]
    .sort((a: any, b: any) => (b?.chapter ?? 0) - (a?.chapter ?? 0))
    .slice(0, 8)
    .map((c: any) => `- 第${c.chapter}章·${String(c.title || "").trim() || c.filename}：${String(c.gistL1 || "").trim()}`)
    .filter(Boolean);

  const parts: string[] = [];
  if (topEvents.length) parts.push("【关键事件（未完成/进行中）】", ...topEvents, "");
  if (lastChapters.length) parts.push("【最近章节摘要】", ...lastChapters, "");
  const txt = parts.join("\n").trim();
  return txt ? truncateForPrompt(txt, 12_000) : "";
}

export async function readBookMemoryCoarse(dataDir: string, bookId: string): Promise<string> {
  try {
    const tl = await readTimelineIndex(dataDir, bookId);
    const fromTimeline = buildCoarseFromTimeline(tl);
    if (fromTimeline) return fromTimeline;
  } catch {
    // ignore
  }

  const candidates = ["story/memory.md", "story/timeline.md", "story/outline.md"];
  for (const rel of candidates) {
    try {
      const raw = await readStoryFile(dataDir, bookId, rel);
      const t = String(raw || "").trim();
      if (t) return truncateForPrompt(t, 12_000);
    } catch {
      // ignore
    }
  }

  return "（全书记忆为空：暂无时间线摘要/事件）";
}

export async function readChapterTextForRescue(
  dataDir: string,
  bookId: string,
  filename: string
): Promise<string> {
  const raw = await readChapter(dataDir, bookId, filename);
  return String(raw || "");
}
