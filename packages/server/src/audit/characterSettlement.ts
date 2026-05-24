import { mergeOccurredNotes } from "../characterOccurredNotes.js";
import type { ChapterExtract } from "./auditExtractSchema.js";
import {
  hasVal,
  mergeFreeText,
  mergeMask,
  mergeObjNonEmpty,
  mergeRelations,
  mergeStrArr,
  normStr
} from "./auditMergeUtils.js";

export function settleCharactersFromExtract(
  idx: { characters?: unknown[]; updatedAt?: string; version?: number },
  extract: ChapterExtract,
  ctx: { auditedAtIso: string; chapterNum: number | null }
): { index: typeof idx; merged: number; created: number } {
  let merged = 0;
  let created = 0;
  const byName = new Map<string, Record<string, unknown>>(
    (idx.characters || [])
      .map((c) => ({ ...(c && typeof c === "object" ? (c as object) : {}), name: normStr((c as { name?: string })?.name) }))
      .filter((c) => c.name)
      .map((c) => [c.name as string, c])
  );

  for (const raw of extract.entities?.characters || []) {
    const name = normStr((raw as { name?: string })?.name);
    if (!name) continue;
    const prev = byName.get(name);
    const next = raw && typeof raw === "object" ? raw : {};
    if (!prev) created++;
    else merged++;

    const mergedChar: Record<string, unknown> = prev ? { ...prev } : { name, updatedAt: ctx.auditedAtIso };
    const locks =
      prev?.locks && typeof prev.locks === "object" ? (prev.locks as Record<string, unknown>) : {};

    if (hasVal((next as { role?: string }).role)) mergedChar.role = normStr((next as { role?: string }).role);
    if (!locks.tags && Array.isArray((next as { tags?: unknown }).tags))
      mergedChar.tags = mergeStrArr(prev?.tags, (next as { tags?: unknown }).tags);

    if ((next as { state?: unknown }).state && typeof (next as { state?: unknown }).state === "object")
      mergedChar.state = mergeObjNonEmpty(prev?.state, (next as { state?: unknown }).state);

    if (!locks.socialTags && (next as { socialTags?: unknown }).socialTags && typeof (next as { socialTags?: unknown }).socialTags === "object") {
      const stPrev = prev?.socialTags && typeof prev.socialTags === "object" ? prev.socialTags : {};
      const stNext = (next as { socialTags: Record<string, unknown> }).socialTags;
      mergedChar.socialTags = {
        ...stPrev,
        ...(hasVal(stNext.profession) ? { profession: normStr(stNext.profession) } : null),
        ...(hasVal(stNext.class) ? { class: normStr(stNext.class) } : null),
        ...(Array.isArray(stNext.titles) ? { titles: mergeStrArr((stPrev as { titles?: unknown }).titles, stNext.titles) } : null),
        ...(Array.isArray(stNext.other) ? { other: mergeStrArr((stPrev as { other?: unknown }).other, stNext.other) } : null)
      };
    }

    if (!locks.historicalDebts && Array.isArray((next as { historicalDebts?: unknown }).historicalDebts))
      mergedChar.historicalDebts = mergeStrArr(prev?.historicalDebts, (next as { historicalDebts?: unknown }).historicalDebts);

    if (!locks.occurredNotes) {
      const extracted: string[] = [];
      for (const ev of extract.entities?.events || []) {
        if (!ev || typeof ev !== "object") continue;
        const ps = Array.isArray((ev as { participants?: unknown }).participants)
          ? (ev as { participants: unknown[] }).participants
          : [];
        const hit = ps.some((p) => String(p || "").trim() === name);
        if (!hit) continue;
        const txt =
          String(
            (ev as { summary?: string; what?: string; event?: string; item?: string }).summary ||
              (ev as { what?: string }).what ||
              (ev as { event?: string }).event ||
              (ev as { item?: string }).item ||
              ""
          ).trim() || "";
        if (txt) extracted.push(txt);
      }
      if (extracted.length)
        mergedChar.occurredNotes = mergeOccurredNotes(prev?.occurredNotes as string[] | undefined, extracted);
    }

    if (!locks.narrativeDrives && (next as { narrativeDrives?: unknown }).narrativeDrives && typeof (next as { narrativeDrives?: unknown }).narrativeDrives === "object") {
      const ndPrev = prev?.narrativeDrives && typeof prev.narrativeDrives === "object" ? prev.narrativeDrives : {};
      const ndNext = (next as { narrativeDrives: Record<string, unknown> }).narrativeDrives;
      mergedChar.narrativeDrives = {
        ...ndPrev,
        ...(hasVal(ndNext.want) ? { want: normStr(ndNext.want) } : null),
        ...(hasVal(ndNext.need) ? { need: normStr(ndNext.need) } : null),
        ...(hasVal(ndNext.moralCompass) ? { moralCompass: normStr(ndNext.moralCompass) } : null),
        ...(Array.isArray(ndNext.flaws) ? { flaws: mergeStrArr((ndPrev as { flaws?: unknown }).flaws, ndNext.flaws) } : null),
        ...(Array.isArray(ndNext.blindSpots) ? { blindSpots: mergeStrArr((ndPrev as { blindSpots?: unknown }).blindSpots, ndNext.blindSpots) } : null)
      };
    }

    if (!locks.fingerprints && (next as { fingerprints?: unknown }).fingerprints && typeof (next as { fingerprints?: unknown }).fingerprints === "object") {
      const fpPrev = prev?.fingerprints && typeof prev.fingerprints === "object" ? prev.fingerprints : {};
      const fpNext = (next as { fingerprints: Record<string, unknown> }).fingerprints;
      mergedChar.fingerprints = {
        ...fpPrev,
        ...(Array.isArray(fpNext.linguisticStyle)
          ? { linguisticStyle: mergeStrArr((fpPrev as { linguisticStyle?: unknown }).linguisticStyle, fpNext.linguisticStyle) }
          : null),
        ...(Array.isArray(fpNext.catchphrases)
          ? { catchphrases: mergeStrArr((fpPrev as { catchphrases?: unknown }).catchphrases, fpNext.catchphrases) }
          : null),
        ...(Array.isArray(fpNext.mannerisms)
          ? { mannerisms: mergeStrArr((fpPrev as { mannerisms?: unknown }).mannerisms, fpNext.mannerisms) }
          : null),
        ...(Array.isArray(fpNext.mask) ? { mask: mergeMask((fpPrev as { mask?: unknown }).mask, fpNext.mask) } : null)
      };
    }

    if (!locks.relationalHooks && (next as { relationalHooks?: unknown }).relationalHooks && typeof (next as { relationalHooks?: unknown }).relationalHooks === "object") {
      const rhPrev = prev?.relationalHooks && typeof prev.relationalHooks === "object" ? prev.relationalHooks : {};
      const rhNext = (next as { relationalHooks: Record<string, unknown> }).relationalHooks;
      mergedChar.relationalHooks = {
        ...rhPrev,
        ...(Array.isArray(rhNext.relations) ? { relations: mergeRelations((rhPrev as { relations?: unknown }).relations, rhNext.relations) } : null),
        ...(hasVal(rhNext.freeText) ? { freeText: mergeFreeText((rhPrev as { freeText?: unknown }).freeText, rhNext.freeText) } : null)
      };
    }

    if (hasVal((next as { personalityAnalysis?: string }).personalityAnalysis))
      mergedChar.personalityAnalysis = normStr((next as { personalityAnalysis?: string }).personalityAnalysis);

    mergedChar.name = name;
    mergedChar.updatedAt = ctx.auditedAtIso;
    if (Number.isFinite(ctx.chapterNum)) mergedChar.lastSeenChapter = ctx.chapterNum;
    byName.set(name, mergedChar);
  }

  idx.characters = [...byName.values()].sort((a, b) =>
    String((a as { name?: string }).name || "").localeCompare(String((b as { name?: string }).name || ""), "zh-Hans-CN")
  );
  idx.updatedAt = ctx.auditedAtIso;
  (idx as { version?: number }).version = 2;
  return { index: idx, merged, created };
}
