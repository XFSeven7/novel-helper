import crypto from "node:crypto";
import { readChapter, writeStoryTimelineMarkdownFromIndex, type TimelineIndex } from "../fsStore.js";
import type { ChapterExtract } from "./auditExtractSchema.js";
import {
  auditIndexesToFileWrites,
  buildAuditRunFromExtract,
  settleIndexesFromExtract
} from "./auditSettlement.js";
import { commitAuditFiles } from "./auditStaging.js";
import { readAllAuditIndexes } from "./readAuditIndexes.js";

export function parseChapterNumberFromFilename(filename: string): number {
  const m = filename.match(/^(\d+)_(.+)\.md$/);
  return m ? Number(m[1]) : NaN;
}

export async function persistChapterAuditFromExtract(
  dataDir: string,
  slug: string,
  filename: string,
  extract: ChapterExtract
): Promise<Record<string, unknown>> {
  const auditedAtIso = String(extract.chapter?.auditedAt || new Date().toISOString());
  extract.chapter = { ...(extract.chapter || {}), filename, auditedAt: auditedAtIso };

  let source: { contentHash: string; contentLength: number } | undefined;
  try {
    const raw = await readChapter(dataDir, slug, filename);
    const normalized = String(raw || "").replace(/\r/g, "");
    const hash = crypto.createHash("sha1").update(normalized, "utf8").digest("hex");
    source = { contentHash: hash, contentLength: normalized.length };
    if (!Number.isFinite(Number(extract.chapter?.wordCount))) {
      extract.chapter.wordCount = normalized.length;
    }
  } catch {
    // ignore
  }

  const chapterNum = parseChapterNumberFromFilename(filename);
  const indexes = await readAllAuditIndexes(dataDir, slug);
  const { indexes: next, report } = settleIndexesFromExtract({
    extract,
    filename,
    chapterNum: Number.isFinite(chapterNum) ? chapterNum : null,
    indexes
  });

  const run = buildAuditRunFromExtract(extract, filename, source, report) as Record<string, unknown>;
  run.humanAuditReport = extract.humanAuditReport;
  run.scores = extract.scores;

  const writes = auditIndexesToFileWrites(next, filename, run);
  await commitAuditFiles(dataDir, slug, writes);

  try {
    await writeStoryTimelineMarkdownFromIndex(dataDir, slug, next.timeline as TimelineIndex);
  } catch {
    // non-fatal
  }

  return run;
}
