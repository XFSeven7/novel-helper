import crypto from "node:crypto";
import type { ChapterExtract } from "./auditExtractSchema.js";
import { normStr } from "./auditMergeUtils.js";

export function settleProgressFromExtract(
  prev: { version?: number; updatedAt?: string; summary?: string; items?: unknown[] },
  extract: ChapterExtract,
  ctx: { filename: string; chapterNo: number | null; title: string; auditedAt: string }
): { index: typeof prev; touched: number } {
  const impacts = Array.isArray(extract.impactAnalysis) ? extract.impactAnalysis : [];
  if (!impacts.length) return { index: prev, touched: 0 };

  const now = ctx.auditedAt;
  const items = [...(Array.isArray(prev.items) ? prev.items : [])];
  let touched = 0;

  for (const raw of impacts) {
    const title = normStr((raw as { item?: string; title?: string }).item || (raw as { title?: string }).title);
    if (!title || title === "[object Object]") continue;
    const id = crypto.createHash("sha1").update(title).digest("hex").slice(0, 16);
    const existing = items.find((it) => String((it as { id?: string }).id || "") === id);
    const detail = normStr((raw as { why?: string }).why);
    if (existing && typeof existing === "object") {
      (existing as { updatedAt?: string }).updatedAt = now;
      if (detail) (existing as { detail?: string }).detail = detail;
      touched++;
      continue;
    }
    items.push({
      id,
      title,
      detail: detail || undefined,
      status: "open",
      createdAt: now,
      updatedAt: now
    });
    touched++;
  }

  return {
    index: {
      version: 1 as const,
      updatedAt: now,
      summary: String(prev.summary || "").trim(),
      lastSourceChapter: {
        filename: ctx.filename,
        chapterNo: Number.isFinite(ctx.chapterNo as number) ? ctx.chapterNo : undefined,
        title: ctx.title
      },
      items: items.slice(0, 30)
    } as Record<string, unknown>,
    touched
  };
}
