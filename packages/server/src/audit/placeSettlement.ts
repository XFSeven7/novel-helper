import type { ChapterExtract } from "./auditExtractSchema.js";

export function settlePlacesFromExtract(
  placesIdx: { places?: unknown[]; hiddenNames?: string[]; updatedAt?: string },
  extract: ChapterExtract,
  ctx: { auditedAt: string; chapterNum: number | null }
): { index: typeof placesIdx; merged: number; created: number } {
  let merged = 0;
  let created = 0;
  const placeExisting = new Map<string, Record<string, unknown>>(
    (placesIdx.places || [])
      .map((p) => ({ ...(p && typeof p === "object" ? (p as object) : {}), name: String((p as { name?: string })?.name || "").trim() }))
      .filter((p) => p.name)
      .map((p) => [p.name as string, p])
  );

  const occurrences: Array<{ name: string; note: string }> = [];
  for (const ev of extract.entities?.events || []) {
    if (!ev || typeof ev !== "object") continue;
    const cand =
      (ev as { place?: string }).place ??
      (ev as { location?: string }).location ??
      (ev as { where?: string }).where ??
      (ev as Record<string, string>)["地点"] ??
      (ev as Record<string, string>)["发生地点"];
    const name = String(cand || "").trim();
    if (!name) continue;
    const note =
      String((ev as { summary?: string }).summary || (ev as { what?: string }).what || (ev as { event?: string }).event || "").trim() ||
      String(extract.gistL1 || "").trim();
    occurrences.push({ name, note });
  }
  for (const c of extract.entities?.characters || []) {
    const loc = String((c as { state?: { location?: string } })?.state?.location || "").trim();
    if (!loc) continue;
    occurrences.push({ name: loc, note: String(extract.gistL1 || "").trim() });
  }

  const uniq = new Map<string, string>();
  for (const o of occurrences) {
    if (!uniq.has(o.name)) uniq.set(o.name, o.note);
  }

  for (const [name, note] of uniq) {
    const prev = placeExisting.get(name);
    if (prev) {
      prev.lastSeenAt = ctx.auditedAt;
      prev.lastChapter = Number.isFinite(ctx.chapterNum as number) ? ctx.chapterNum : prev.lastChapter;
      prev.lastNote = note || prev.lastNote || "";
      prev.updatedAt = ctx.auditedAt;
      placeExisting.set(name, prev);
      merged++;
    } else {
      placeExisting.set(name, {
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

  placesIdx.places = [...placeExisting.values()].sort((a, b) =>
    String((a as { name?: string }).name || "").localeCompare(String((b as { name?: string }).name || ""), "zh-Hans-CN")
  );
  if (!Array.isArray(placesIdx.hiddenNames)) placesIdx.hiddenNames = [];
  placesIdx.updatedAt = ctx.auditedAt;
  return { index: placesIdx, merged, created };
}
