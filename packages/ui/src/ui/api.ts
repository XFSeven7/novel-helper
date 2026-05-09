export type BookMeta = {
  slug: string;
  title: string;
  createdAt: string;
  chapterCount: number;
  status: "进行中" | "已完结";
  /** 介于 1..最大序号之间的空缺（文件名符合「序号_标题.md」） */
  missingChapterIndexes: number[];
  synopsis?: string;
  completed?: boolean;
};

export type ChapterMeta = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  wordCount: number;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  const hasJsonStringBody = typeof body === "string" && body.length > 0;
  if (hasJsonStringBody && !headers.has("Content-Type") && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export type StoryFile = {
  kind: "story" | "character";
  path: string;
  title: string;
  role?: string;
  tags?: string[];
};

export async function listBooks() {
  return await http<{ books: BookMeta[] }>("/api/books");
}

export async function createBook(input: { title: string; slug?: string; synopsis?: string }) {
  return await http<{ book: BookMeta }>("/api/books", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function patchBookSynopsis(slug: string, synopsis: string) {
  return await http<{ book: BookMeta }>(`/api/books/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify({ synopsis })
  });
}

export async function patchBookCompleted(slug: string, completed: boolean) {
  return await http<{ book: BookMeta }>(`/api/books/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify({ completed })
  });
}

export async function deleteBook(slug: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

export async function restoreBook(slug: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(slug)}/restore`, { method: "POST" });
}

export async function listChapters(slug: string) {
  return await http<{ chapters: ChapterMeta[] }>(`/api/books/${encodeURIComponent(slug)}/chapters`);
}

export async function createChapter(
  slug: string,
  input: { title: string; content?: string; chapterIndex?: number }
) {
  return await http<{ chapter: ChapterMeta }>(`/api/books/${encodeURIComponent(slug)}/chapters`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function readChapter(slug: string, filename: string) {
  return await http<{ content: string }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}`
  );
}

export async function updateChapter(slug: string, filename: string, content: string) {
  return await http<{ ok: true }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}`,
    { method: "PUT", body: JSON.stringify({ content }) }
  );
}

export async function renameChapter(slug: string, filename: string, title: string) {
  return await http<{ chapter: ChapterMeta }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}`,
    { method: "PATCH", body: JSON.stringify({ title }) }
  );
}

export async function suggestChapterTitles(
  slug: string,
  filename: string,
  input: {
    modelConfigId: string | null;
    count?: number;
    style?: "normal" | "boom" | "suspense" | "hotblood" | "funny" | "poetic" | "minimal";
  }
) {
  return await http<{ ok: true; titles: string[] }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}/title/suggest`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function suggestChapterTitlesBatch(
  slug: string,
  filename: string,
  input: {
    modelConfigId: string | null;
    count?: number;
    styles?: Array<"normal" | "boom" | "suspense" | "hotblood" | "funny" | "poetic" | "minimal">;
  }
) {
  return await http<{ ok: true; results: Array<{ style: string; titles: string[] }> }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}/title/suggest/batch`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function deleteChapter(slug: string, filename: string) {
  return await http<{ ok: true }>(
    `/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
}

export type ModelProviderId = "openai" | "deepseek" | "gemini" | "qwen" | "ollama" | "custom";
export type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProviderId;
  baseUrl: string;
  apiKey: string;
  testUrl: string;
  model?: string;
  extraHeadersJson?: string;
  lastTestOk?: boolean;
  lastModels?: string[];
};

export async function putModelConfigs(input: { configs: ModelConfig[]; activeId: string | null }) {
  return await http<{ ok: true }>(`/api/settings/model-configs`, {
    method: "PUT",
    body: JSON.stringify({ configs: input.configs, activeId: input.activeId })
  });
}

export async function auditChapter(slug: string, filename: string, modelConfigId: string | null) {
  return await http<{ run: any }>(`/api/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(filename)}/audit`, {
    method: "POST",
    body: JSON.stringify({ modelConfigId })
  });
}

export async function getAuditLatest(slug: string, chapterFilename: string) {
  return await http<{ run: any }>(
    `/api/books/${encodeURIComponent(slug)}/audit/latest?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export async function getAuditAnalysis(slug: string, chapterFilename: string) {
  return await http<{ text: string }>(
    `/api/books/${encodeURIComponent(slug)}/audit/analysis?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export async function saveAuditAnalysis(slug: string, input: { chapterFilename: string; text: string }) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(slug)}/audit/analysis/save`, {
    method: "POST",
    body: JSON.stringify({ chapter: input.chapterFilename, text: input.text ?? "" })
  });
}

export async function getAuditLedger(slug: string) {
  return await http<{ ledger: any }>(`/api/books/${encodeURIComponent(slug)}/audit/ledger`);
}

export async function getAuditCharacters(slug: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters`);
}

export async function hideAuditCharacter(slug: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditCharacter(
  slug: string,
  input: {
    name: string;
    role?: string;
    tags?: string[];
    state?: any;
    locks?: {
      tags?: boolean;
      socialTags?: boolean;
      historicalDebts?: boolean;
      occurredNotes?: boolean;
      narrativeDrives?: boolean;
      fingerprints?: boolean;
      relationalHooks?: boolean;
    };
    socialTags?: {
      profession?: string;
      class?: string;
      titles?: string[];
      other?: string[];
    };
    historicalDebts?: string[];
    narrativeDrives?: {
      want?: string;
      need?: string;
      moralCompass?: string;
      flaws?: string[];
      blindSpots?: string[];
    };
    fingerprints?: {
      linguisticStyle?: string[];
      catchphrases?: string[];
      mannerisms?: string[];
      mask?: Array<{ context?: string; persona?: string }>;
    };
    relationalHooks?: {
      relations?: Array<{
        targetName: string;
        types?: string[];
        emotionalPolarity?: string;
        conflictIndex?: string;
        sharedSecrets?: string[];
      }>;
      freeText?: string;
    };
    occurredNotes?: string[];
    personalityAnalysis?: string;
  }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function mergeAuditCharacters(slug: string, input: { primaryName: string; secondaryNames: string[] }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters/merge`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewMergeAuditCharacters(
  slug: string,
  input: { primaryName: string; secondaryNames: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; draft: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters/merge/preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applyMergeAuditCharacters(
  slug: string,
  input: { primaryName: string; secondaryNames: string[]; draft: any }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters/merge/apply`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getAuditPlaces(slug: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/places`);
}

export async function hideAuditPlace(slug: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/places/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditPlace(
  slug: string,
  input: { name: string; description?: string; lastNote?: string }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/places/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewMergeAuditPlaces(
  slug: string,
  input: { primaryName: string; secondaryNames: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; draft: any }>(`/api/books/${encodeURIComponent(slug)}/audit/places/merge/preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applyMergeAuditPlaces(
  slug: string,
  input: { primaryName: string; secondaryNames: string[]; draft: any }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/places/merge/apply`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getAuditOrgs(slug: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/orgs`);
}

export async function hideAuditOrg(slug: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/orgs/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditOrg(slug: string, input: { name: string; description?: string; lastNote?: string }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/orgs/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type ForeshadowStatus = "open" | "progress" | "closed";
export type ForeshadowItem = {
  id: string;
  title: string;
  status: ForeshadowStatus;
  firstChapter?: number;
  lastChapter?: number;
  chapters?: number[];
  lastProgress?: string;
  note?: string;
  updatedAt: string;
};
export type ForeshadowsIndex = {
  version: 1;
  updatedAt: string;
  foreshadows: ForeshadowItem[];
  hiddenIds: string[];
};

export async function getAuditForeshadows(slug: string) {
  return await http<{ index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(slug)}/audit/foreshadows`);
}

export async function getAuditProgress(slug: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/progress`);
}

export async function markAuditProgressItem(slug: string, input: { id: string; status: "open" | "progress" | "done" }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/progress/mark`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function cleanupAuditProgressDone(slug: string) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/progress/cleanupDone`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export type WritingPack = {
  version: 1;
  updatedAt: string;
  source: {
    windowChapters: number;
    windowCompressedRanges: number;
    pickedProgress: number;
    pickedForeshadows: number;
  };
  chapterTarget: { filename: string; title?: string; chapterNo?: number };
  summary5: string[];
  lists: {
    progress: Array<{ id: string; title: string; basis?: string }>;
    foreshadows: Array<{ id: string; title: string; basis?: string }>;
    risks: Array<{ issue: string; severity?: string; basis?: string }>;
  };
  disclaimer: string;
};

export async function getWritingPack(slug: string, chapterFilename: string) {
  return await http<{ pack: WritingPack | null }>(
    `/api/books/${encodeURIComponent(slug)}/writing-pack?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export async function generateWritingPack(
  slug: string,
  input: { chapterFilename: string; modelConfigId: string | null }
) {
  return await http<{ ok: true; pack: WritingPack }>(`/api/books/${encodeURIComponent(slug)}/writing-pack/generate`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type BookSearchHit = {
  kind: "chapters";
  path: string;
  title: string;
  lineNo: number;
  excerpt: string;
  matchRanges: Array<[number, number]>;
};
export type BookSearchGroup = { kind: BookSearchHit["kind"]; count: number; hits: BookSearchHit[] };

export async function searchBook(
  slug: string,
  input: {
    q: string;
    sort?: "asc" | "desc";
    caseSensitive?: boolean;
    wholeWord?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  return await http<{ total: number; groups: BookSearchGroup[] }>(`/api/books/${encodeURIComponent(slug)}/search`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createAuditForeshadow(
  slug: string,
  input: { title: string; status?: ForeshadowStatus; lastProgress?: string; note?: string; chapters?: number[] }
) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(slug)}/audit/foreshadows/create`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditForeshadow(
  slug: string,
  input: { id: string; title?: string; status?: ForeshadowStatus; lastProgress?: string; note?: string; chapters?: number[] }
) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(slug)}/audit/foreshadows/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function hideAuditForeshadow(slug: string, input: { id: string; hidden: boolean }) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(slug)}/audit/foreshadows/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type TimelineIndex = {
  version: 1;
  updatedAt: string;
  chapters: Array<{
    chapter: number;
    filename: string;
    title: string;
    auditedAt: string;
    gistL1: string;
  }>;
  compressedRanges: Array<{
    startChapter: number;
    endChapter: number;
    summary: string;
    lastCompressedAt: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    startChapter: number;
    endChapter: number;
    summary: string;
    status: "open" | "done";
    updatedAt: string;
  }>;
  compressionSuggestions: Array<{ startChapter: number; endChapter: number; why: string }>;
  manual: { doneEventIds: string[] };
};

export async function getTimelineIndex(slug: string) {
  return await http<{ index: TimelineIndex }>(`/api/books/${encodeURIComponent(slug)}/timeline/index`);
}

export type IdeaItemStatus = "active" | "hidden" | "deleted";
export type IdeaItemType = "naming" | "note" | "generation";
export type IdeaItem = {
  id: string;
  type: IdeaItemType;
  subtype?: string;
  title?: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  status: IdeaItemStatus;
  createdAt: string;
  updatedAt: string;
  source?: { provider?: string; model?: string; prompt?: string };
  meta?: {
    parentId?: string;
    variantPolicy?: any;
    usedMemory?: boolean;
    itemOwnerCharacterName?: string;
    itemOwnerMode?: "bound" | "floating";
  };
};
export type InspirationIndex = { version: 1; updatedAt: string; items: IdeaItem[] };

export async function getInspirationIndex(slug: string) {
  return await http<{ index: InspirationIndex }>(`/api/books/${encodeURIComponent(slug)}/inspiration`);
}

export async function upsertInspirationItem(
  slug: string,
  item: Partial<IdeaItem> & { content: string }
) {
  return await http<{ ok: true; index: InspirationIndex; item: IdeaItem }>(`/api/books/${encodeURIComponent(slug)}/inspiration/upsert`, {
    method: "POST",
    body: JSON.stringify({ item })
  });
}

export async function setInspirationItemStatus(slug: string, input: { id: string; status: IdeaItemStatus }) {
  return await http<{ ok: true; index: InspirationIndex }>(`/api/books/${encodeURIComponent(slug)}/inspiration/status`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function purgeInspirationDeleted(slug: string) {
  return await http<{ ok: true; index: InspirationIndex; purged: number }>(`/api/books/${encodeURIComponent(slug)}/inspiration/purge`, {
    method: "POST"
  });
}

export async function generateInspiration(slug: string, input: {
  modelConfigId: string | null;
  kind: "character" | "place" | "org" | "item" | "other";
  count?: number;
  useMemory?: boolean;
  options?: any;
  freeText?: string;
  itemOwnerCharacterName?: string;
}) {
  return await http<{ ok: true; index: InspirationIndex; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(slug)}/inspiration/generate`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function generateInspirationPreview(slug: string, input: {
  modelConfigId: string | null;
  kind: "character" | "place" | "org" | "item" | "other";
  count?: number;
  useMemory?: boolean;
  options?: any;
  freeText?: string;
  itemOwnerCharacterName?: string;
}) {
  return await http<{ ok: true; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(slug)}/inspiration/generate-preview`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function generateInspirationVariants(slug: string, input: {
  modelConfigId: string | null;
  id: string;
  count?: number;
  preset?: string;
  freeText?: string;
}) {
  return await http<{ ok: true; index: InspirationIndex; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(slug)}/inspiration/variant`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function compressTimelineRange(
  slug: string,
  input: { startChapter: number; endChapter: number; modelConfigId: string | null }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(slug)}/timeline/compress`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteTimelineRange(
  slug: string,
  input: { startChapter: number; endChapter: number }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(slug)}/timeline/range/delete`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function markTimelineEvent(
  slug: string,
  input: { id: string; status: "open" | "done" }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(slug)}/timeline/event/mark`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listStory(slug: string) {
  return await http<{ storyFiles: StoryFile[]; charFiles: StoryFile[] }>(
    `/api/books/${encodeURIComponent(slug)}/story`
  );
}

export async function readStoryFile(slug: string, relPath: string) {
  return await http<{ content: string }>(
    `/api/books/${encodeURIComponent(slug)}/story/file?path=${encodeURIComponent(relPath)}`
  );
}

export async function updateStoryFile(slug: string, relPath: string, content: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(slug)}/story/file`, {
    method: "PUT",
    body: JSON.stringify({ path: relPath, content })
  });
}

export async function createCharacter(
  slug: string,
  input: { name: string; role?: string; tags?: string[] }
) {
  return await http<{ character: { relPath: string } }>(
    `/api/books/${encodeURIComponent(slug)}/story/characters`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function mergeCharacterCards(
  slug: string,
  input: { primaryPath: string; secondaryPaths: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; charFiles: StoryFile[] }>(`/api/books/${encodeURIComponent(slug)}/story/characters/merge`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

