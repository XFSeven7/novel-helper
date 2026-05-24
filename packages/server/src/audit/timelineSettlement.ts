import type { TimelineIndex } from "../fsStore.js";
import type { ChapterExtract } from "./auditExtractSchema.js";

export function settleTimelineFromExtract(
  idx: TimelineIndex,
  extract: ChapterExtract,
  ctx: { filename: string; chapterNum: number; title: string; auditedAt: string }
): { index: TimelineIndex; eventsUpserted: number } {
  const gistL1 = String(extract.gistL1 || "").trim();
  const row = {
    chapter: ctx.chapterNum,
    filename: ctx.filename,
    title: ctx.title,
    auditedAt: ctx.auditedAt,
    gistL1
  };
  const existingI = idx.chapters.findIndex((c) => c.filename === ctx.filename);
  if (existingI >= 0) idx.chapters[existingI] = row;
  else idx.chapters.push(row);
  idx.chapters.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

  let eventsUpserted = 0;
  const events = Array.isArray(idx.events) ? [...idx.events] : [];
  for (const ev of extract.entities?.events || []) {
    const title = String((ev as { summary?: string }).summary || (ev as { what?: string }).what || "").trim();
    if (!title) continue;
    const existing = events.find(
      (e) => String(e.title || "") === title && (e.startChapter ?? 0) === ctx.chapterNum
    );
    if (existing) {
      existing.summary = title;
      existing.endChapter = ctx.chapterNum;
    } else {
      events.push({
        id: `ch${ctx.chapterNum}-ev-${eventsUpserted}`,
        title,
        startChapter: ctx.chapterNum,
        endChapter: ctx.chapterNum,
        summary: title,
        status: "open",
        updatedAt: ctx.auditedAt
      });
      eventsUpserted++;
    }
  }
  idx.events = events;
  idx.updatedAt = ctx.auditedAt;
  return { index: idx, eventsUpserted };
}
