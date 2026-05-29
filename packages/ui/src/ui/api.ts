export type BookMeta = {
  bookId: string;
  title: string;
  createdAt: string;
  chapterCount: number;
  status: "进行中" | "已完结";
  /** 介于 1..最大序号之间的空缺（文件名符合「序号_标题.md」） */
  missingChapterIndexes: number[];
  /** 可选展示别名 */
  slug?: string;
  /** 归档的建书规划 session */
  setupSessionId?: string;
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

function parseHttpError(text: string): string {
  const t = text.trim();
  if (!t) return "";
  try {
    const j = JSON.parse(t) as { message?: string; error?: string };
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* not JSON */
  }
  return t;
}

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
    throw new Error(parseHttpError(text) || `HTTP ${res.status}`);
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

export async function patchBookSynopsis(bookId: string, synopsis: string) {
  return await http<{ book: BookMeta }>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "PATCH",
    body: JSON.stringify({ synopsis })
  });
}

export async function patchBookCompleted(bookId: string, completed: boolean) {
  return await http<{ book: BookMeta }>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "PATCH",
    body: JSON.stringify({ completed })
  });
}

export async function deleteBook(bookId: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
}

export async function restoreBook(bookId: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(bookId)}/restore`, { method: "POST" });
}

export async function listChapters(bookId: string) {
  return await http<{ chapters: ChapterMeta[] }>(`/api/books/${encodeURIComponent(bookId)}/chapters`);
}

export async function createChapter(
  bookId: string,
  input: { title: string; content?: string; chapterIndex?: number }
) {
  return await http<{ chapter: ChapterMeta }>(`/api/books/${encodeURIComponent(bookId)}/chapters`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function readChapter(bookId: string, filename: string) {
  return await http<{ content: string }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}`
  );
}

export async function updateChapter(bookId: string, filename: string, content: string) {
  return await http<{ ok: true }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}`,
    { method: "PUT", body: JSON.stringify({ content }) }
  );
}

export async function renameChapter(bookId: string, filename: string, title: string) {
  return await http<{ chapter: ChapterMeta }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}`,
    { method: "PATCH", body: JSON.stringify({ title }) }
  );
}

export async function suggestChapterTitles(
  bookId: string,
  filename: string,
  input: {
    modelConfigId: string | null;
    count?: number;
    style?: "normal" | "boom" | "suspense" | "hotblood" | "funny" | "poetic" | "minimal";
  }
) {
  return await http<{ ok: true; titles: string[] }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/title/suggest`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function suggestChapterTitlesBatch(
  bookId: string,
  filename: string,
  input: {
    modelConfigId: string | null;
    count?: number;
    styles?: Array<"normal" | "boom" | "suspense" | "hotblood" | "funny" | "poetic" | "minimal">;
  }
) {
  return await http<{ ok: true; results: Array<{ style: string; titles: string[] }> }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/title/suggest/batch`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function deleteChapter(bookId: string, filename: string) {
  return await http<{ ok: true }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}`,
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

export type ModelBenchmarkTimeline = {
  t_srv_received_ms: number;
  t_srv_validated_ms?: number;
  t_upstream_start_ms?: number;
  t_upstream_first_token_ms?: number;
  t_upstream_done_ms?: number;
  t_srv_respond_start_ms?: number;
  t_srv_respond_done_ms?: number;
  client_wait_first_byte_ms?: number;
  client_download_parse_ms?: number;
  client_total_ms?: number;
};

export type ModelBenchmarkDurations = {
  server_total_ms?: number;
  server_overhead_ms?: number;
  model_ttfb_ms?: number;
  model_total_ms?: number;
  server_postprocess_ms?: number;
  server_respond_ms?: number;
};

export type ModelBenchmarkRecord = {
  id: string;
  createdAt: string;
  ok: boolean;
  error?: string;
  modelConfigId: string;
  modelLabel: string;
  provider: string;
  modelName?: string;
  baseUrl?: string;
  inputChars: number;
  outputChars?: number;
  outputPreview?: string;
  timeline: ModelBenchmarkTimeline;
  durations?: ModelBenchmarkDurations;
};

export async function runModelBenchmark(input: {
  modelConfigId: string;
  model?: string;
  input: string;
  maxOutputChars?: number;
  client?: {
    client_wait_first_byte_ms?: number;
    client_download_parse_ms?: number;
    client_total_ms?: number;
  };
}) {
  return await http<{ ok: true; record: ModelBenchmarkRecord; outputText: string }>(`/api/settings/model-benchmark/run`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getModelBenchmarkHistory(limit = 200) {
  return await http<{ ok: true; items: ModelBenchmarkRecord[] }>(
    `/api/settings/model-benchmark/history?limit=${encodeURIComponent(String(limit))}`
  );
}

export async function clearModelBenchmarkHistory() {
  return await http<{ ok: true }>(`/api/settings/model-benchmark/history`, {
    method: "DELETE"
  });
}

export async function patchModelBenchmarkRecordClient(
  id: string,
  client: NonNullable<Parameters<typeof runModelBenchmark>[0]["client"]>
) {
  return await http<{ ok: true; record: ModelBenchmarkRecord }>(
    `/api/settings/model-benchmark/history/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ client }) }
  );
}

export type AppSettings = {
  effectiveDataDir: string;
  source: "env" | "file" | "default";
  fileDataDir: string | null;
  envLocked: boolean;
};

export async function getAppSettings() {
  return await http<AppSettings>(`/api/settings/app`);
}

export type PutAppSettingsResult = {
  ok: true;
  effectiveDataDir: string;
  migrated: boolean;
  bookCount: number;
  sourceDeleted?: boolean;
  deleteSourceWarning?: string;
};

export async function putAppSettings(input: {
  dataDir: string;
  migrate?: boolean;
  deleteSource?: boolean;
}) {
  return await http<PutAppSettingsResult>(`/api/settings/app`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function pickAppDataDirectory() {
  return await http<{ cancelled: true } | { cancelled: false; path: string }>(
    `/api/settings/app/pick-directory`,
    { method: "POST" }
  );
}

export type OpenAppDataDirectoryResult = {
  ok: true;
  platform: string;
  wsl: boolean;
  resolved: string;
  winPath?: string;
  method: string;
};

export async function openAppDataDirectory(dirPath?: string) {
  const pathArg = dirPath?.trim() || "";
  const body = pathArg ? { path: pathArg } : {};
  console.log("[novel-helper:open-data-dir] fetch POST /api/settings/app/open-directory", body);
  const result = await http<OpenAppDataDirectoryResult>(`/api/settings/app/open-directory`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  console.log("[novel-helper:open-data-dir] fetch response", result);
  return result;
}

export async function auditChapter(bookId: string, filename: string, modelConfigId: string | null) {
  return await http<{ run: any }>(`/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/audit`, {
    method: "POST",
    body: JSON.stringify({ modelConfigId })
  });
}

export async function getAuditLatest(bookId: string, chapterFilename: string) {
  return await http<{ run: any }>(
    `/api/books/${encodeURIComponent(bookId)}/audit/latest?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export type ChapterVersionMeta = {
  id: string;
  createdAt: string;
  label: string;
  wordCount: number;
  contentHash: string;
  source: "manual";
};

export async function getChapterDraftStatus(bookId: string) {
  return await http<{ outOfSync: string[] }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/draft-status`
  );
}

export async function listChapterVersions(bookId: string, filename: string) {
  return await http<{ versions: ChapterVersionMeta[]; latestContentHash: string | null }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/versions`
  );
}

export async function createChapterVersion(
  bookId: string,
  filename: string,
  input: { label?: string }
) {
  return await http<{
    version: ChapterVersionMeta;
    /** 模拟评论已在后台排队生成 */
    readerCommentsQueued?: boolean;
  }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/versions`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function getChapterVersion(bookId: string, filename: string, versionId: string) {
  return await http<{ version: ChapterVersionMeta; content: string }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/versions/${encodeURIComponent(versionId)}`
  );
}

export async function restoreChapterVersion(bookId: string, filename: string, versionId: string) {
  return await http<{ wordCount: number }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export type AuditChapterStaleEntry = {
  filename: string;
  stale: boolean;
  currentHash: string;
  auditedHash: string;
};

export async function getAuditChapterStale(bookId: string) {
  return await http<{ chapters: AuditChapterStaleEntry[] }>(
    `/api/books/${encodeURIComponent(bookId)}/audit/stale-chapters`
  );
}

export async function clearBookAudit(bookId: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(bookId)}/audit`, { method: "DELETE" });
}

export async function getAuditAnalysis(bookId: string, chapterFilename: string) {
  return await http<{ text: string }>(
    `/api/books/${encodeURIComponent(bookId)}/audit/analysis?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export async function saveAuditAnalysis(bookId: string, input: { chapterFilename: string; text: string }) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(bookId)}/audit/analysis/save`, {
    method: "POST",
    body: JSON.stringify({ chapter: input.chapterFilename, text: input.text ?? "" })
  });
}

export async function getAuditLedger(bookId: string) {
  return await http<{ ledger: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/ledger`);
}

export async function getAuditCharacters(bookId: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters`);
}

export async function hideAuditCharacter(bookId: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditCharacter(
  bookId: string,
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
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function mergeAuditCharacters(bookId: string, input: { primaryName: string; secondaryNames: string[] }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters/merge`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewMergeAuditCharacters(
  bookId: string,
  input: { primaryName: string; secondaryNames: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; draft: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters/merge/preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applyMergeAuditCharacters(
  bookId: string,
  input: { primaryName: string; secondaryNames: string[]; draft: any }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/characters/merge/apply`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getAuditPlaces(bookId: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/places`);
}

export async function hideAuditPlace(bookId: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/places/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditPlace(
  bookId: string,
  input: { name: string; description?: string; lastNote?: string }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/places/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewMergeAuditPlaces(
  bookId: string,
  input: { primaryName: string; secondaryNames: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; draft: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/places/merge/preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applyMergeAuditPlaces(
  bookId: string,
  input: { primaryName: string; secondaryNames: string[]; draft: any }
) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/places/merge/apply`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getAuditOrgs(bookId: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/orgs`);
}

export async function hideAuditOrg(bookId: string, input: { name: string; hidden: boolean }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/orgs/hide`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditOrg(bookId: string, input: { name: string; description?: string; lastNote?: string }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/orgs/update`, {
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
  chapterActivity?: Record<string, string>;
  updatedAt: string;
};
export type ForeshadowsIndex = {
  version: 1;
  updatedAt: string;
  foreshadows: ForeshadowItem[];
  hiddenIds: string[];
};

export async function getAuditForeshadows(bookId: string) {
  return await http<{ index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(bookId)}/audit/foreshadows`);
}

export async function getAuditProgress(bookId: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/progress`);
}

export async function markAuditProgressItem(bookId: string, input: { id: string; status: "open" | "progress" | "done" }) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/progress/mark`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function cleanupAuditProgressDone(bookId: string) {
  return await http<{ ok: true; index: any }>(`/api/books/${encodeURIComponent(bookId)}/audit/progress/cleanupDone`, {
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
    foreshadows: Array<{ id: string; title: string; basis?: string; seedExcerpt?: string }>;
    risks: Array<{ issue: string; severity?: string; basis?: string }>;
  };
  disclaimer: string;
};

export async function getWritingPack(bookId: string, chapterFilename: string) {
  return await http<{ pack: WritingPack | null }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-pack?chapter=${encodeURIComponent(chapterFilename)}`
  );
}

export async function generateWritingPack(
  bookId: string,
  input: { chapterFilename: string; modelConfigId: string | null }
) {
  return await http<{ ok: true; pack: WritingPack }>(`/api/books/${encodeURIComponent(bookId)}/writing-pack/generate`, {
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
  bookId: string,
  input: {
    q: string;
    sort?: "asc" | "desc";
    caseSensitive?: boolean;
    wholeWord?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  return await http<{ total: number; groups: BookSearchGroup[] }>(`/api/books/${encodeURIComponent(bookId)}/search`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createAuditForeshadow(
  bookId: string,
  input: { title: string; status?: ForeshadowStatus; lastProgress?: string; note?: string; chapters?: number[] }
) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(bookId)}/audit/foreshadows/create`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAuditForeshadow(
  bookId: string,
  input: { id: string; title?: string; status?: ForeshadowStatus; lastProgress?: string; note?: string; chapters?: number[] }
) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(bookId)}/audit/foreshadows/update`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function hideAuditForeshadow(bookId: string, input: { id: string; hidden: boolean }) {
  return await http<{ ok: true; index: ForeshadowsIndex }>(`/api/books/${encodeURIComponent(bookId)}/audit/foreshadows/hide`, {
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

export async function getTimelineIndex(bookId: string) {
  return await http<{ index: TimelineIndex }>(`/api/books/${encodeURIComponent(bookId)}/timeline/index`);
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

export async function getInspirationIndex(bookId: string) {
  return await http<{ index: InspirationIndex }>(`/api/books/${encodeURIComponent(bookId)}/inspiration`);
}

export async function upsertInspirationItem(
  bookId: string,
  item: Partial<IdeaItem> & { content: string }
) {
  return await http<{ ok: true; index: InspirationIndex; item: IdeaItem }>(`/api/books/${encodeURIComponent(bookId)}/inspiration/upsert`, {
    method: "POST",
    body: JSON.stringify({ item })
  });
}

export async function setInspirationItemStatus(bookId: string, input: { id: string; status: IdeaItemStatus }) {
  return await http<{ ok: true; index: InspirationIndex }>(`/api/books/${encodeURIComponent(bookId)}/inspiration/status`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function purgeInspirationDeleted(bookId: string) {
  return await http<{ ok: true; index: InspirationIndex; purged: number }>(`/api/books/${encodeURIComponent(bookId)}/inspiration/purge`, {
    method: "POST"
  });
}

export async function generateInspiration(bookId: string, input: {
  modelConfigId: string | null;
  kind: "character" | "place" | "org" | "item" | "event" | "lore" | "technique" | "other";
  count?: number;
  useMemory?: boolean;
  options?: any;
  freeText?: string;
  itemOwnerCharacterName?: string;
}) {
  return await http<{ ok: true; index: InspirationIndex; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(bookId)}/inspiration/generate`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function generateInspirationPreview(bookId: string, input: {
  modelConfigId: string | null;
  kind: "character" | "place" | "org" | "item" | "event" | "lore" | "technique" | "other";
  count?: number;
  useMemory?: boolean;
  options?: any;
  freeText?: string;
  itemOwnerCharacterName?: string;
}) {
  return await http<{ ok: true; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(bookId)}/inspiration/generate-preview`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function generateInspirationVariants(bookId: string, input: {
  modelConfigId: string | null;
  id: string;
  count?: number;
  preset?: string;
  freeText?: string;
}) {
  return await http<{ ok: true; index: InspirationIndex; items: IdeaItem[]; debug?: { prompt: string; rawText: string } }>(
    `/api/books/${encodeURIComponent(bookId)}/inspiration/variant`,
    {
    method: "POST",
    body: JSON.stringify(input)
    }
  );
}

export async function compressTimelineRange(
  bookId: string,
  input: { startChapter: number; endChapter: number; modelConfigId: string | null }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(bookId)}/timeline/compress`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteTimelineRange(
  bookId: string,
  input: { startChapter: number; endChapter: number }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(bookId)}/timeline/range/delete`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function markTimelineEvent(
  bookId: string,
  input: { id: string; status: "open" | "done" }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(bookId)}/timeline/event/mark`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listStory(bookId: string) {
  return await http<{ storyFiles: StoryFile[]; charFiles: StoryFile[] }>(
    `/api/books/${encodeURIComponent(bookId)}/story`
  );
}

export async function readStoryFile(bookId: string, relPath: string) {
  return await http<{ content: string }>(
    `/api/books/${encodeURIComponent(bookId)}/story/file?path=${encodeURIComponent(relPath)}`
  );
}

export async function updateStoryFile(bookId: string, relPath: string, content: string) {
  return await http<{ ok: true }>(`/api/books/${encodeURIComponent(bookId)}/story/file`, {
    method: "PUT",
    body: JSON.stringify({ path: relPath, content })
  });
}

export async function createCharacter(
  bookId: string,
  input: { name: string; role?: string; tags?: string[] }
) {
  return await http<{ character: { relPath: string } }>(
    `/api/books/${encodeURIComponent(bookId)}/story/characters`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function mergeCharacterCards(
  bookId: string,
  input: { primaryPath: string; secondaryPaths: string[]; modelConfigId: string | null }
) {
  return await http<{ ok: true; charFiles: StoryFile[] }>(`/api/books/${encodeURIComponent(bookId)}/story/characters/merge`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type BookStats = {
  totalChapters: number;
  totalWords: number;
  avgChapterLength: number;
  maxChapterWordCount: number;
  maxChapterTitle: string;
  minChapterWordCount: number;
  minChapterTitle: string;
  streak: number;
  daysSinceLastWrite: number;
  lastWriteDate: string;
  dailyBreakdown: { date: string; words: number; chapters: number }[];
  chapterWordCounts: { index: number; title: string; wordCount: number; filename: string }[];
  cumulativeWords: { index: number; title: string; words: number }[];
  activeDaysLast7: number;
  activeDaysLast30: number;
  avgNetWordsPerActiveDay30: number;
  weeklyActivity: { weekStart: string; activeDays: number; netWords: number }[];
  writingActivity: { date: string; words: number; chapters: number }[];
  availableYears: number[];
};

export async function getBookStats(bookId: string) {
  return await http<{ stats: BookStats }>(`/api/books/${encodeURIComponent(bookId)}/stats`);
}

export type StageChatTurn = {
  id: string;
  user: { content: string; createdAt: string };
  assistant: { content: string; createdAt: string };
};

export type OutlineStageNode = {
  id: string;
  label: string;
  note?: string;
  children?: OutlineStageNode[];
  /** @deprecated v1 UI 不编辑，normalize 时保留 */
  chapterRange?: string;
  chatTurns?: StageChatTurn[];
};

export type BookOutline = {
  logline?: string;
  synopsis?: {
    setup?: string;
    development?: string;
    twist?: string;
    climax?: string;
    ending?: string;
  };
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;
  mainlineStages?: OutlineStageNode[];
};

export type VolumeOutline = {
  id: string;
  title: string;
  order: number;
  synopsis?: string;
  chapterFilenames: string[];
};

export type ChapterPlan = {
  updatedAt?: string;
  core?: string;
  scenes?: string;
  pov?: string;
  time?: string;
  beats?: string[];
  foreshadowPlant?: string[];
  foreshadowPayoff?: string[];
  hook?: string;
  coolPoint?: string;
  rhythmNote?: string;
};

export type OutlineIndex = {
  version: 1;
  updatedAt: string;
  book: BookOutline;
  volumes: VolumeOutline[];
  ungroupedFilenames: string[];
  chapterPlans: Record<string, ChapterPlan>;
};

export type OutlineAiMode =
  | "snowflake"
  | "fromChapters"
  | "refineChapterPlan"
  | "volumeChapterPlans"
  | "foreshadowAudit";

export async function getOutline(bookId: string) {
  return await http<{ outline: OutlineIndex }>(`/api/books/${encodeURIComponent(bookId)}/outline`);
}

export async function patchOutline(bookId: string, outline: OutlineIndex) {
  return await http<{ outline: OutlineIndex }>(`/api/books/${encodeURIComponent(bookId)}/outline`, {
    method: "PATCH",
    body: JSON.stringify({ outline })
  });
}

export async function generateOutlineAi(
  bookId: string,
  body: {
    mode: OutlineAiMode;
    modelConfigId?: string | null;
    instruction?: string;
    volumeId?: string;
    chapterFilename?: string;
    options?: {
      useWorld?: boolean;
      useForeshadows?: boolean;
      useTimeline?: boolean;
      targetVolumes?: number;
      logline?: string;
      overwrite?: boolean;
    };
  }
) {
  return await http<{ preview: Partial<OutlineIndex> | { report: string }; warnings?: string[] }>(
    `/api/books/${encodeURIComponent(bookId)}/outline/ai`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function applyOutlineAiPreview(
  bookId: string,
  body: { preview: Partial<OutlineIndex> | { report: string }; overwrite?: boolean }
) {
  return await http<{ outline: OutlineIndex; warnings?: string[] }>(
    `/api/books/${encodeURIComponent(bookId)}/outline/ai/apply`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- 建书前大纲向导 ---

export type BookSetupStepId =
  | "intent"
  | "scale"
  | "logline"
  | "synopsis"
  | "mainline"
  | "volumes"
  | "chapterSkeleton"
  | "meta"
  | "review";

export type BookSetupChatMessage = { role: "user" | "assistant"; content: string };

export type BookSetupDraft = {
  version: 1;
  updatedAt: string;
  currentStep: BookSetupStepId;
  skippedSteps: BookSetupStepId[];
  visitedSteps?: BookSetupStepId[];
  linkedBookId?: string;
  title?: string;
  slug?: string;
  metaSynopsis?: string;
  concept?: string;
  genreNotes?: string;
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;
  outline: OutlineIndex;
  missingFields: string[];
  nextQuestion?: string;
  readyToCreate: boolean;
  stepMessages: Partial<Record<BookSetupStepId, BookSetupChatMessage[]>>;
};

export type BookSetupChatSuggestion = {
  concept?: string;
  genreNotes?: string;
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;
  title?: string;
  metaSynopsis?: string;
  logline?: string;
  synopsis?: BookOutline["synopsis"];
  mainlineStages?: BookOutline["mainlineStages"];
  volumes?: Array<{ title: string; order: number; synopsis?: string }>;
};

export type BookSetupChatResponse = {
  assistantMessage: string;
  nextQuestion?: string;
  missingFields?: string[];
  suggestion?: BookSetupChatSuggestion;
  draft?: BookSetupDraft;
  syncWarning?: string;
};

const BOOK_SETUP_SESSION_KEY = "novel-helper-book-setup-session";

export function getStoredBookSetupSessionId(): string | null {
  try {
    return localStorage.getItem(BOOK_SETUP_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredBookSetupSessionId(id: string) {
  try {
    localStorage.setItem(BOOK_SETUP_SESSION_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearStoredBookSetupSessionId() {
  try {
    localStorage.removeItem(BOOK_SETUP_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type BookSetupPlanEntry = {
  sessionId: string;
  registeredAt: string;
  updatedAt: string;
  displayTitle: string;
  currentStep: BookSetupStepId;
  readyToCreate: boolean;
};

export async function listBookSetupPlans() {
  return await http<{ plans: BookSetupPlanEntry[] }>("/api/book-setup/plans");
}

export async function discardBookSetupPlan(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/book-setup/plans/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(parseHttpError(text) || `HTTP ${res.status}`);
  }
}

export async function suggestBookSetupTitle(sessionId: string, body?: { modelConfigId?: string | null }) {
  return await http<{ title: string; draft: BookSetupDraft }>(
    `/api/book-setup/sessions/${encodeURIComponent(sessionId)}/suggest-title`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export async function createBookSetupSession() {
  return await http<{ sessionId: string; draft: BookSetupDraft }>("/api/book-setup/sessions", {
    method: "POST"
  });
}

export async function getBookSetupSession(sessionId: string) {
  return await http<{ draft: BookSetupDraft }>(`/api/book-setup/sessions/${encodeURIComponent(sessionId)}`);
}

export async function patchBookSetupSession(sessionId: string, body: { draft?: Partial<BookSetupDraft>; currentStep?: BookSetupStepId }) {
  return await http<{ draft: BookSetupDraft; syncWarning?: string }>(`/api/book-setup/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function chatBookSetupStep(
  sessionId: string,
  body: { stepId: BookSetupStepId; message: string; modelConfigId?: string | null }
) {
  return await http<BookSetupChatResponse>(`/api/book-setup/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function applyBookSetupStep(
  sessionId: string,
  body: { stepId: BookSetupStepId; modelConfigId?: string | null }
) {
  return await http<BookSetupChatResponse>(
    `/api/book-setup/sessions/${encodeURIComponent(sessionId)}/apply-step`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function redesignBookSetupMainline(
  sessionId: string,
  body?: { modelConfigId?: string | null }
) {
  return await http<BookSetupChatResponse>(
    `/api/book-setup/sessions/${encodeURIComponent(sessionId)}/redesign-mainline`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export async function commitBookSetupSession(sessionId: string, body?: { title?: string; slug?: string }) {
  return await http<{ book: BookMeta; bookId: string }>(
    `/api/book-setup/sessions/${encodeURIComponent(sessionId)}/commit`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export async function deleteBookSetupSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/book-setup/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(parseHttpError(text) || `HTTP ${res.status}`);
  }
}

export type BookNotebook = {
  id: string;
  name: string;
  builtIn?: boolean;
  order: number;
};

export type BookNoteEntry = {
  id: string;
  notebookId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
};

export type BookNotesIndex = {
  version: 1;
  updatedAt: string;
  notebooks: BookNotebook[];
  entries: BookNoteEntry[];
};

export async function fetchBookNotes(bookId: string) {
  return await http<{ index: BookNotesIndex }>(`/api/books/${encodeURIComponent(bookId)}/notes`);
}

export async function createBookNotesNotebook(bookId: string, name: string) {
  return await http<{ index: BookNotesIndex }>(`/api/books/${encodeURIComponent(bookId)}/notes/notebooks`, {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function patchBookNotesNotebook(
  bookId: string,
  notebookId: string,
  body: { name?: string; order?: number }
) {
  return await http<{ index: BookNotesIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/notes/notebooks/${encodeURIComponent(notebookId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function deleteBookNotesNotebook(bookId: string, notebookId: string) {
  return await http<{ index: BookNotesIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/notes/notebooks/${encodeURIComponent(notebookId)}`,
    { method: "DELETE" }
  );
}

export async function createBookNoteEntry(bookId: string, notebookId: string, content: string) {
  return await http<{ index: BookNotesIndex }>(`/api/books/${encodeURIComponent(bookId)}/notes/entries`, {
    method: "POST",
    body: JSON.stringify({ notebookId, content })
  });
}

export async function patchBookNoteEntry(
  bookId: string,
  entryId: string,
  body: { content?: string; pinned?: boolean; notebookId?: string }
) {
  return await http<{ index: BookNotesIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/notes/entries/${encodeURIComponent(entryId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function deleteBookNoteEntry(bookId: string, entryId: string) {
  return await http<{ index: BookNotesIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/notes/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" }
  );
}

export type GuidanceMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type GuidanceTurnPart = {
  content: string;
  createdAt: string;
};

export type GuidanceTurn = {
  id: string;
  user: GuidanceTurnPart;
  assistant: GuidanceTurnPart;
  hidden?: boolean;
  starred?: boolean;
};

export type GuidanceSession = {
  id: string;
  notebookId: string;
  title: string;
  turns: GuidanceTurn[];
  starred?: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type WritingGuidanceIndex = {
  version: 1 | 2;
  updatedAt: string;
  notebooks: BookNotebook[];
  sessions: GuidanceSession[];
};

export async function fetchWritingGuidance(bookId: string) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance`
  );
}

export async function createGuidanceNotebook(bookId: string, name: string) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/notebooks`,
    { method: "POST", body: JSON.stringify({ name }) }
  );
}

export async function patchGuidanceNotebook(
  bookId: string,
  notebookId: string,
  body: { name?: string; order?: number }
) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/notebooks/${encodeURIComponent(notebookId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function deleteGuidanceNotebook(bookId: string, notebookId: string) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/notebooks/${encodeURIComponent(notebookId)}`,
    { method: "DELETE" }
  );
}

export async function createGuidanceSession(
  bookId: string,
  notebookId: string,
  title?: string
) {
  return await http<{ index: WritingGuidanceIndex; sessionId: string }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions`,
    { method: "POST", body: JSON.stringify({ notebookId, title }) }
  );
}

export async function patchGuidanceSession(
  bookId: string,
  sessionId: string,
  body: { title?: string; notebookId?: string; starred?: boolean }
) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions/${encodeURIComponent(sessionId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function patchGuidanceTurn(
  bookId: string,
  sessionId: string,
  turnId: string,
  body: { hidden?: boolean; starred?: boolean }
) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function deleteGuidanceSession(bookId: string, sessionId: string) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
}

export async function reorderGuidanceSessions(
  bookId: string,
  notebookId: string,
  sessionIds: string[]
) {
  return await http<{ index: WritingGuidanceIndex }>(
    `/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions/reorder`,
    { method: "POST", body: JSON.stringify({ notebookId, sessionIds }) }
  );
}

export type ReaderCommentsSettings = {
  maxAiCommentsPerChapter: number;
  commentsPerChapterMin: number;
  commentsPerChapterMax: number;
  useChapterAnalysisInput: boolean;
  npcReplyProbability: number;
  readerReplyReaderProbability: number;
  inviteCooldownMs: number;
};

export type ReaderPersona = {
  id: string;
  nickname: string;
  archetype: string;
  tier: "deep" | "normal" | "lurker";
  traits: string[];
  emojiStyle: "none" | "light" | "heavy";
  templateSlots: { like?: string[]; short?: string[]; deep?: string[] };
  source: "builtin" | "generated";
};

export type ReaderPersonaPoolStats = {
  builtinCount: number;
  customCount: number;
  totalCount: number;
  commentsPerChapterMin: number;
  commentsPerChapterMax: number;
};

export type FeatureModelsResponse = {
  configs: ModelConfig[];
  activeId: string | null;
  featureModels: { organize?: string | null; readerComments?: string | null; training?: string | null };
  features: { readerCommentsEnabled?: boolean; trainingModeEnabled?: boolean };
  readerComments: ReaderCommentsSettings;
  readerPersonaPool?: ReaderPersonaPoolStats;
};

export async function getFeatureModels() {
  return await http<FeatureModelsResponse>(`/api/settings/feature-models`);
}

export async function putFeatureModels(input: Partial<FeatureModelsResponse>) {
  return await http<{ ok: true }>(`/api/settings/feature-models`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function listReaderPersonas(params?: { q?: string; page?: number; pageSize?: number }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return await http<{ items: ReaderPersona[]; total: number; page: number; pageSize: number }>(
    `/api/settings/reader-personas${qs ? `?${qs}` : ""}`
  );
}

export async function generateReaderPersonas(count: number) {
  return await http<{ ok: true; added: number }>(`/api/settings/reader-personas/generate`, {
    method: "POST",
    body: JSON.stringify({ count })
  });
}

export type TrainingCategory = {
  id: string;
  title: string;
  order: number;
  teachingFile?: string;
  contentMarkdown: string;
  rubricHints: string[];
  exerciseDefaults: { minChars: number; maxChars: number };
};

export type TrainingChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type TrainingQuestion = {
  id: string;
  categoryId: string;
  title: string;
  prompt: string;
  minChars: number;
  maxChars: number;
  snippet?: { title: string; body: string };
  createdAt: string;
  source: "ai";
};

export type TrainingTreeQuestion = TrainingQuestion & {
  attemptCount: number;
  bestScore: number | null;
};

export type TrainingTreeCategory = TrainingCategory & {
  attemptCount: number;
  questionCount: number;
  questions: TrainingTreeQuestion[];
};

export type TrainingGradingMode = "infernal" | "strict" | "honest";

export type TrainingExecutionDetail = {
  crimeScene: string;
  roast: string;
};

export type TrainingGradingResult = {
  attitudeDiagnosis: string;
  sanityDamage: number;
  soulCrushingMockery: string;
  executionDetails: TrainingExecutionDetail[];
  overallScore: number;
  purgatoryPenalty: string;
};

export type TrainingAttempt = {
  id: string;
  questionId: string;
  categoryId: string;
  text: string;
  result: TrainingGradingResult;
  gradingMode?: TrainingGradingMode;
  modelConfigId: string;
  createdAt: string;
};

export async function getTrainingTree() {
  return await http<{ categories: TrainingTreeCategory[] }>(`/api/training/tree`);
}

export async function getTrainingCategory(id: string) {
  return await http<{ category: TrainingCategory }>(`/api/training/categories/${encodeURIComponent(id)}`);
}

export async function getTrainingCategoryChat(categoryId: string) {
  return await http<{ messages: TrainingChatMessage[] }>(
    `/api/training/categories/${encodeURIComponent(categoryId)}/chat`
  );
}

export async function clearTrainingCategoryChat(categoryId: string) {
  return await http<{ ok: boolean }>(`/api/training/categories/${encodeURIComponent(categoryId)}/chat`, {
    method: "DELETE"
  });
}

export async function getTrainingQuestion(id: string) {
  return await http<{ question: TrainingQuestion }>(`/api/training/questions/${encodeURIComponent(id)}`);
}

export async function generateTrainingQuestions(categoryId: string, count: 1 | 3 | 5) {
  return await http<{ questions: TrainingQuestion[] }>(
    `/api/training/categories/${encodeURIComponent(categoryId)}/generate-questions`,
    { method: "POST", body: JSON.stringify({ count }) }
  );
}

export async function submitTrainingQuestion(
  questionId: string,
  text: string,
  gradingMode: TrainingGradingMode
) {
  return await http<{ attempt: TrainingAttempt; result: TrainingGradingResult }>(
    `/api/training/questions/${encodeURIComponent(questionId)}/submit`,
    { method: "POST", body: JSON.stringify({ text, gradingMode }) }
  );
}

export async function getTrainingQuestionAttempts(questionId: string) {
  return await http<{ question: TrainingQuestion; attempts: TrainingAttempt[] }>(
    `/api/training/questions/${encodeURIComponent(questionId)}/attempts`
  );
}

export async function listTrainingAttempts() {
  return await http<{ attempts: TrainingAttempt[] }>(`/api/training/attempts`);
}

export async function getTrainingAttempt(id: string) {
  return await http<{ attempt: TrainingAttempt }>(`/api/training/attempts/${encodeURIComponent(id)}`);
}

export type ReaderCommentReply = {
  id: string;
  authorKind: "persona" | "author";
  personaId: string | null;
  replyToId: string | null;
  text: string;
  createdAt: string;
};

export type ReaderCommentThread = {
  id: string;
  personaId: string;
  kind: "deep" | "short" | "like";
  text: string;
  createdAt: string;
  pinned?: boolean;
  replies: ReaderCommentReply[];
};

export type ChapterReaderComments = {
  version: 1;
  contentHash: string;
  generatedAt: string;
  readCount: number;
  threads: ReaderCommentThread[];
  lurkerSample: string[];
};

export async function getChapterReaderComments(bookId: string, filename: string) {
  return await http<{
    comments: ChapterReaderComments | null;
    nicknames: Record<string, string>;
    generating?: boolean;
  }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/reader-comments`
  );
}

export async function generateChapterReaderComments(bookId: string, filename: string) {
  return await http<{ queued: true }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/reader-comments/generate`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function replyChapterReaderComment(
  bookId: string,
  filename: string,
  threadId: string,
  text: string
) {
  return await http<{ comments: ChapterReaderComments; nicknames: Record<string, string> }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/reader-comments/reply`,
    { method: "POST", body: JSON.stringify({ threadId, text }) }
  );
}

export async function patchReaderCommentThread(
  bookId: string,
  filename: string,
  threadId: string,
  pinned: boolean
) {
  return await http<{ comments: ChapterReaderComments; nicknames: Record<string, string> }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/reader-comments/threads/${encodeURIComponent(threadId)}`,
    { method: "PATCH", body: JSON.stringify({ pinned }) }
  );
}

export async function deleteReaderCommentThread(bookId: string, filename: string, threadId: string) {
  return await http<{ comments: ChapterReaderComments; nicknames: Record<string, string> }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/reader-comments/threads/${encodeURIComponent(threadId)}`,
    { method: "DELETE" }
  );
}

export async function inviteReaderPersonas(bookId: string, count = 20) {
  return await http<{ ok: true; added: number }>(
    `/api/books/${encodeURIComponent(bookId)}/reader-personas/invite`,
    { method: "POST", body: JSON.stringify({ count }) }
  );
}

export type WritingBlockRescueResult = {
  event: Record<"A" | "B" | "C", {
    oneLinePlan: string;
    readerHook: string;
    risk: string;
    beats: string[];
    sceneCard: {
      goal: string;
      conflict: string;
      turningPoint: string;
      cost: string;
      reveal: string;
      hook: string;
    };
    decisions: { choice: string; consequence: string; risk: string; whenToUse: string }[];
    citations: string[];
    newInfo?: boolean;
    oocEdgeTest?: boolean;
  }>;
  emotion: WritingBlockRescueResult["event"];
  info: WritingBlockRescueResult["event"];
};

export async function postWritingBlockRescue(body: {
  bookId: string;
  chapterFilename: string;
  length: "short" | "mid" | "long";
  moreChaos?: boolean;
  cursorHint?: string;
  entropyCardId?: string;
  injectEntropy?: boolean;
}) {
  return await http<{
    result: WritingBlockRescueResult;
    context?: { memoryChars: number; chapterChars: number };
  }>("/api/writing-block/rescue", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

