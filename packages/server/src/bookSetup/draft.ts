import { createDefaultOutlineIndex, type BookOutline, type OutlineIndex, writeOutlineIndex } from "../outlineStore.js";
import { patchNovelMetaFields } from "../fsStore.js";
import type { BookSetupChatSuggestion, BookSetupDraft, BookSetupStepId } from "./types.js";

export function createEmptyDraft(): BookSetupDraft {
  const base = createDefaultOutlineIndex([]);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentStep: "intent",
    skippedSteps: [],
    visitedSteps: ["intent"],
    outline: {
      book: { ...base.book },
      volumes: [],
      ungroupedFilenames: [],
      chapterPlans: {}
    },
    missingFields: [],
    readyToCreate: false,
    stepMessages: {}
  };
}

export function touchDraft(draft: BookSetupDraft): BookSetupDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    readyToCreate: computeReadyToCreate(draft)
  };
}

export function applyDraftPatch(draft: BookSetupDraft, patch: Partial<BookSetupDraft>): BookSetupDraft {
  const next: BookSetupDraft = {
    ...draft,
    ...patch,
    outline: patch.outline
      ? {
          book: { ...draft.outline.book, ...patch.outline.book },
          volumes: patch.outline.volumes ?? draft.outline.volumes,
          ungroupedFilenames: patch.outline.ungroupedFilenames ?? draft.outline.ungroupedFilenames,
          chapterPlans: patch.outline.chapterPlans ?? draft.outline.chapterPlans
        }
      : draft.outline,
    stepMessages: patch.stepMessages ?? draft.stepMessages,
    skippedSteps: patch.skippedSteps ?? draft.skippedSteps,
    visitedSteps: patch.visitedSteps ?? draft.visitedSteps ?? [draft.currentStep],
    missingFields: patch.missingFields ?? draft.missingFields
  };
  return touchDraft(next);
}

export async function syncDraftToBook(
  dataDir: string,
  bookId: string,
  draft: BookSetupDraft
): Promise<void> {
  await writeOutlineIndex(dataDir, bookId, draftToOutlineIndex(draft));
  const synopsis = (draft.metaSynopsis?.trim() || draft.concept?.trim() || "").slice(0, 20000);
  await patchNovelMetaFields(dataDir, bookId, {
    ...(draft.title?.trim() ? { title: draft.title.trim() } : {}),
    synopsis,
    ...(draft.slug !== undefined ? { slug: draft.slug.trim() } : {})
  });
}

function normalizeMainlineStagesForOutline(
  stages: BookSetupDraft["outline"]["book"]["mainlineStages"]
): BookOutline["mainlineStages"] {
  if (!stages?.length) return undefined;
  const next = stages.map((s, i) => ({
    id: (s.id || `stage-${i + 1}`).trim(),
    label: (s.label ?? "").trim() || `阶段${i + 1}`,
    chapterRange: typeof s.chapterRange === "string" ? s.chapterRange : "",
    note: typeof s.note === "string" ? s.note : ""
  }));
  return next.length ? next : undefined;
}

export function draftToOutlineIndex(draft: BookSetupDraft): OutlineIndex {
  const book: BookOutline = {
    ...draft.outline.book,
    mainlineStages: normalizeMainlineStagesForOutline(draft.outline.book.mainlineStages),
    targetWords: draft.targetWords ?? draft.outline.book.targetWords,
    targetChapters: draft.targetChapters ?? draft.outline.book.targetChapters,
    structureFramework: draft.structureFramework ?? draft.outline.book.structureFramework
  };
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    book,
    volumes: draft.outline.volumes.map((v) => ({
      ...v,
      chapterFilenames: v.chapterFilenames ?? []
    })),
    ungroupedFilenames: [],
    chapterPlans: { ...draft.outline.chapterPlans }
  };
}

export function computeReadyToCreate(draft: BookSetupDraft): boolean {
  const title = draft.title?.trim();
  if (!title) return false;

  const logline = draft.outline.book.logline?.trim();
  if (!logline) return false;

  const syn = draft.outline.book.synopsis;
  const synCount = syn
    ? [syn.setup, syn.development, syn.twist, syn.climax, syn.ending].filter((x) => String(x || "").trim()).length
    : 0;
  const conceptOk = (draft.concept?.trim().length ?? 0) >= 30;
  if (synCount < 2 && !conceptOk) return false;

  const skippedVolumes = draft.skippedSteps.includes("volumes");
  if (!skippedVolumes && draft.outline.volumes.length < 1) return false;

  return true;
}

export function listMissingForReview(draft: BookSetupDraft): string[] {
  const missing: string[] = [];
  if (!draft.title?.trim()) missing.push("书名");
  if (!draft.outline.book.logline?.trim()) missing.push("一句话梗概");
  const syn = draft.outline.book.synopsis;
  const synCount = syn
    ? [syn.setup, syn.development, syn.twist, syn.climax, syn.ending].filter((x) => String(x || "").trim()).length
    : 0;
  if (synCount < 2 && (draft.concept?.trim().length ?? 0) < 30) missing.push("五段梗概或创作概念（至少其一足够具体）");
  if (!draft.skippedSteps.includes("volumes") && draft.outline.volumes.length < 1) missing.push("至少一卷分卷规划");
  return missing;
}

/** 将 apply/chat 的 suggestion 写入草案（与前端 applySuggestionToDraft 对齐） */
export function applyBookSetupSuggestionToDraft(
  draft: BookSetupDraft,
  _stepId: BookSetupStepId,
  s: BookSetupChatSuggestion
): BookSetupDraft {
  if (s.mainlineStages !== undefined) {
    return applyMainlineStagesFromSuggestion(draft, s.mainlineStages);
  }

  const book = { ...draft.outline.book };
  const top: Partial<BookSetupDraft> = {};
  if (s.concept != null) top.concept = s.concept;
  if (s.genreNotes != null) top.genreNotes = s.genreNotes;
  if (s.targetWords != null) top.targetWords = s.targetWords;
  if (s.targetChapters != null) top.targetChapters = s.targetChapters;
  if (s.structureFramework != null) top.structureFramework = s.structureFramework;
  if (s.title != null) top.title = s.title;
  if (s.metaSynopsis != null) top.metaSynopsis = s.metaSynopsis;
  if (s.logline != null) book.logline = s.logline;
  if (s.synopsis) book.synopsis = { ...book.synopsis, ...s.synopsis };

  const outline: BookSetupDraft["outline"] = {
    ...draft.outline,
    book
  };
  if (s.volumes?.length) {
    outline.volumes = s.volumes.map((v, i) => ({
      id: `vol-${Date.now()}-${i}`,
      title: v.title,
      order: v.order,
      synopsis: v.synopsis ?? "",
      chapterFilenames: []
    }));
  }

  return applyDraftPatch(draft, { ...top, outline });
}

/** 根据对话 suggestion 同步主线阶段列表（保留已有 id，整表替换为当前共识） */
export function applyMainlineStagesFromSuggestion(
  draft: BookSetupDraft,
  stages: NonNullable<BookSetupChatSuggestion["mainlineStages"]>
): BookSetupDraft {
  const existing = draft.outline.book.mainlineStages ?? [];
  const merged = stages.map((st, i) => {
    const label = String(st.label ?? "").trim();
    const match =
      (st.id && existing.find((e) => e.id === st.id)) ||
      (label && existing.find((e) => e.label.trim() === label)) ||
      existing[i];
    return {
      id: match?.id ?? st.id ?? `stage-${Date.now()}-${i}`,
      label: label || match?.label || "",
      chapterRange: String(st.chapterRange ?? match?.chapterRange ?? "").trim(),
      note: String(st.note ?? match?.note ?? "").trim()
    };
  });
  return applyDraftPatch(draft, {
    outline: {
      ...draft.outline,
      book: { ...draft.outline.book, mainlineStages: merged }
    }
  });
}

export function isValidStepId(id: string): id is BookSetupStepId {
  return (
    id === "intent" ||
    id === "scale" ||
    id === "logline" ||
    id === "synopsis" ||
    id === "mainline" ||
    id === "volumes" ||
    id === "chapterSkeleton" ||
    id === "meta" ||
    id === "review"
  );
}
