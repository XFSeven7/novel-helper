import type { ChapterExtract } from "./auditExtractSchema.js";

export function settleOrgsFromExtract(
  orgsIdx: { orgs?: unknown[]; hiddenNames?: string[]; updatedAt?: string },
  extract: ChapterExtract,
  ctx: { auditedAt: string; chapterNum: number | null }
): { index: typeof orgsIdx; merged: number; created: number } {
  let merged = 0;
  let created = 0;
  const orgExisting = new Map<string, Record<string, unknown>>(
    (orgsIdx.orgs || [])
      .map((o) => ({ ...(o && typeof o === "object" ? (o as object) : {}), name: String((o as { name?: string })?.name || "").trim() }))
      .filter((o) => o.name)
      .map((o) => [o.name as string, o])
  );

  const orgOccurrences: Array<{ name: string; note: string }> = [];
  for (const ev of extract.entities?.events || []) {
    if (!ev || typeof ev !== "object") continue;
    const cand =
      (ev as { org?: string }).org ??
      (ev as { organization?: string }).organization ??
      (ev as { faction?: string }).faction ??
      (ev as Record<string, string>)["组织"] ??
      (ev as Record<string, string>)["势力"];
    const name = String(cand || "").trim();
    if (!name) continue;
    const note =
      String((ev as { summary?: string }).summary || (ev as { what?: string }).what || (ev as { event?: string }).event || "").trim() ||
      String(extract.gistL1 || "").trim();
    orgOccurrences.push({ name, note });
  }

  const orgUniq = new Map<string, string>();
  for (const o of orgOccurrences) if (!orgUniq.has(o.name)) orgUniq.set(o.name, o.note);

  for (const [name, note] of orgUniq) {
    const prev = orgExisting.get(name);
    if (prev) {
      prev.lastSeenAt = ctx.auditedAt;
      prev.lastChapter = Number.isFinite(ctx.chapterNum as number) ? ctx.chapterNum : prev.lastChapter;
      prev.lastNote = note || prev.lastNote || "";
      prev.updatedAt = ctx.auditedAt;
      orgExisting.set(name, prev);
      merged++;
    } else {
      orgExisting.set(name, {
        name,
        description: "",
        lastNote: note || "",
        firstSeenAt: ctx.auditedAt,
        lastSeenAt: ctx.auditedAt,
        firstChapter: Number.isFinite(ctx.chapterNum as number) ? ctx.chapterNum : 0,
        lastChapter: Number.isFinite(ctx.chapterNum as number) ? ctx.chapterNum : 0,
        updatedAt: ctx.auditedAt
      });
      created++;
    }
  }

  orgsIdx.orgs = [...orgExisting.values()].sort((a, b) =>
    String((a as { name?: string }).name || "").localeCompare(String((b as { name?: string }).name || ""), "zh-Hans-CN")
  );
  if (!Array.isArray(orgsIdx.hiddenNames)) orgsIdx.hiddenNames = [];
  orgsIdx.updatedAt = ctx.auditedAt;
  return { index: orgsIdx, merged, created };
}
