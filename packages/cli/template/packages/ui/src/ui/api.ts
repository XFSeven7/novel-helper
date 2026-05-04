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

export async function createCharacter(slug: string, name: string) {
  return await http<{ character: { relPath: string } }>(
    `/api/books/${encodeURIComponent(slug)}/story/characters`,
    { method: "POST", body: JSON.stringify({ name }) }
  );
}

