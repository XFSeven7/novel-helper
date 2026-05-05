export type BookMeta = {
  slug: string;
  title: string;
  createdAt: string;
  chapterCount: number;
  status: "进行中";
  missingChapterIndexes: number[];
  synopsis?: string;
};

export type ChapterMeta = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  wordCount: number;
};

export type StoryFile = {
  kind: "story" | "character";
  path: string;
  title: string;
  role?: string;
  tags?: string[];
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

export async function getAuditLedger(slug: string) {
  return await http<{ ledger: any }>(`/api/books/${encodeURIComponent(slug)}/audit/ledger`);
}

export async function getAuditCharacters(slug: string) {
  return await http<{ index: any }>(`/api/books/${encodeURIComponent(slug)}/audit/characters`);
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

export async function compressTimelineRange(
  slug: string,
  input: { startChapter: number; endChapter: number; modelConfigId: string | null }
) {
  return await http<{ ok: true; index: TimelineIndex }>(`/api/books/${encodeURIComponent(slug)}/timeline/compress`, {
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

