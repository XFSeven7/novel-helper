import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUILT_IN_NOTEBOOK_ID,
  BUILT_IN_NOTEBOOK_NAME,
  MAX_NOTE_CONTENT_LEN,
  type BookNoteEntry,
  type BookNotebook,
  type BookNotesIndex
} from "./types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function notesIndexPath(dataDir: string, bookId: string) {
  return path.join(dataDir, bookId, "notes", "index.json");
}

export function createDefaultNotesIndex(): BookNotesIndex {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    notebooks: [
      {
        id: BUILT_IN_NOTEBOOK_ID,
        name: BUILT_IN_NOTEBOOK_NAME,
        builtIn: true,
        order: 0
      }
    ],
    entries: []
  };
}

function normalizeNotebook(raw: unknown, fallbackOrder: number): BookNotebook | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as BookNotebook;
  const id = String(o.id || "").trim();
  const name = String(o.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    builtIn: Boolean(o.builtIn) || id === BUILT_IN_NOTEBOOK_ID,
    order: Number.isFinite(o.order) ? Number(o.order) : fallbackOrder
  };
}

function normalizeEntry(raw: unknown): BookNoteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as BookNoteEntry;
  const id = String(o.id || "").trim();
  const notebookId = String(o.notebookId || "").trim();
  const content = String(o.content || "");
  if (!id || !notebookId || !content.trim()) return null;
  return {
    id,
    notebookId,
    content: content.slice(0, MAX_NOTE_CONTENT_LEN),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    pinned: Boolean(o.pinned)
  };
}

export function normalizeNotesIndex(parsed: unknown): BookNotesIndex {
  const base = createDefaultNotesIndex();
  if (!parsed || typeof parsed !== "object") return base;

  const p = parsed as BookNotesIndex;
  const notebooks: BookNotebook[] = [];
  if (Array.isArray(p.notebooks)) {
    p.notebooks.forEach((n, i) => {
      const nb = normalizeNotebook(n, i);
      if (nb) notebooks.push(nb);
    });
  }
  if (!notebooks.some((n) => n.id === BUILT_IN_NOTEBOOK_ID)) {
    notebooks.unshift({
      id: BUILT_IN_NOTEBOOK_ID,
      name: BUILT_IN_NOTEBOOK_NAME,
      builtIn: true,
      order: 0
    });
  }
  notebooks.sort((a, b) => a.order - b.order);

  const notebookIds = new Set(notebooks.map((n) => n.id));
  const entries: BookNoteEntry[] = [];
  if (Array.isArray(p.entries)) {
    for (const e of p.entries) {
      const ent = normalizeEntry(e);
      if (ent && notebookIds.has(ent.notebookId)) entries.push(ent);
    }
  }

  return {
    version: 1,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
    notebooks,
    entries
  };
}

export async function readNotesIndex(dataDir: string, bookId: string): Promise<BookNotesIndex | null> {
  const p = notesIndexPath(dataDir, bookId);
  if (!(await exists(p))) return null;
  const raw = await fs.readFile(p, "utf8");
  return normalizeNotesIndex(JSON.parse(raw));
}

export async function writeNotesIndex(dataDir: string, bookId: string, index: BookNotesIndex): Promise<BookNotesIndex> {
  const dir = path.join(dataDir, bookId, "notes");
  await fs.mkdir(dir, { recursive: true });
  const next: BookNotesIndex = {
    ...normalizeNotesIndex(index),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(notesIndexPath(dataDir, bookId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function ensureNotesIndex(dataDir: string, bookId: string): Promise<BookNotesIndex> {
  const existing = await readNotesIndex(dataDir, bookId);
  if (existing) return existing;
  return writeNotesIndex(dataDir, bookId, createDefaultNotesIndex());
}

function findNotebook(index: BookNotesIndex, notebookId: string) {
  return index.notebooks.find((n) => n.id === notebookId);
}

export async function addNotebook(dataDir: string, bookId: string, name: string): Promise<BookNotesIndex> {
  const index = await ensureNotesIndex(dataDir, bookId);
  const trimmed = name.trim() || "新笔记本";
  const maxOrder = index.notebooks.reduce((m, n) => Math.max(m, n.order), -1);
  const notebook: BookNotebook = {
    id: crypto.randomUUID(),
    name: trimmed,
    order: maxOrder + 1
  };
  return writeNotesIndex(dataDir, bookId, {
    ...index,
    notebooks: [...index.notebooks, notebook]
  });
}

export async function patchNotebook(
  dataDir: string,
  bookId: string,
  notebookId: string,
  patch: { name?: string; order?: number }
): Promise<BookNotesIndex> {
  const index = await ensureNotesIndex(dataDir, bookId);
  const nb = findNotebook(index, notebookId);
  if (!nb) throw new Error("Not found");
  const notebooks = index.notebooks.map((n) => {
    if (n.id !== notebookId) return n;
    return {
      ...n,
      ...(patch.name !== undefined ? { name: patch.name.trim() || n.name } : {}),
      ...(patch.order !== undefined && Number.isFinite(patch.order) ? { order: patch.order } : {})
    };
  });
  return writeNotesIndex(dataDir, bookId, { ...index, notebooks });
}

export async function deleteNotebook(
  dataDir: string,
  bookId: string,
  notebookId: string
): Promise<{ index: BookNotesIndex; entryCount: number }> {
  const index = await ensureNotesIndex(dataDir, bookId);
  const nb = findNotebook(index, notebookId);
  if (!nb) throw new Error("Not found");
  if (nb.builtIn || notebookId === BUILT_IN_NOTEBOOK_ID) {
    throw new Error("Cannot delete built-in notebook");
  }
  const entryCount = index.entries.filter((e) => e.notebookId === notebookId).length;
  if (entryCount > 0) {
    const err = new Error("Notebook has entries") as Error & { entryCount: number };
    err.entryCount = entryCount;
    throw err;
  }
  const notebooks = index.notebooks.filter((n) => n.id !== notebookId);
  return { index: await writeNotesIndex(dataDir, bookId, { ...index, notebooks }), entryCount: 0 };
}

export async function addEntry(
  dataDir: string,
  bookId: string,
  notebookId: string,
  content: string
): Promise<BookNotesIndex> {
  const index = await ensureNotesIndex(dataDir, bookId);
  if (!findNotebook(index, notebookId)) throw new Error("Notebook not found");
  const text = content.trim();
  if (!text) throw new Error("Content required");
  const now = new Date().toISOString();
  const entry: BookNoteEntry = {
    id: crypto.randomUUID(),
    notebookId,
    content: text.slice(0, MAX_NOTE_CONTENT_LEN),
    createdAt: now,
    updatedAt: now,
    pinned: false
  };
  return writeNotesIndex(dataDir, bookId, {
    ...index,
    entries: [...index.entries, entry]
  });
}

export async function patchEntry(
  dataDir: string,
  bookId: string,
  entryId: string,
  patch: { content?: string; pinned?: boolean; notebookId?: string }
): Promise<BookNotesIndex> {
  const index = await ensureNotesIndex(dataDir, bookId);
  const i = index.entries.findIndex((e) => e.id === entryId);
  if (i < 0) throw new Error("Not found");
  const current = index.entries[i]!;
  if (patch.notebookId !== undefined && !findNotebook(index, patch.notebookId)) {
    throw new Error("Notebook not found");
  }
  if (patch.content !== undefined && !patch.content.trim()) {
    throw new Error("Content required");
  }
  const now = new Date().toISOString();
  const next: BookNoteEntry = {
    ...current,
    ...(patch.content !== undefined ? { content: patch.content.trim().slice(0, MAX_NOTE_CONTENT_LEN) } : {}),
    ...(patch.pinned !== undefined ? { pinned: Boolean(patch.pinned) } : {}),
    ...(patch.notebookId !== undefined ? { notebookId: patch.notebookId } : {}),
    updatedAt: now
  };
  const entries = [...index.entries];
  entries[i] = next;
  return writeNotesIndex(dataDir, bookId, { ...index, entries });
}

export async function deleteEntry(dataDir: string, bookId: string, entryId: string): Promise<BookNotesIndex> {
  const index = await ensureNotesIndex(dataDir, bookId);
  const entries = index.entries.filter((e) => e.id !== entryId);
  if (entries.length === index.entries.length) throw new Error("Not found");
  return writeNotesIndex(dataDir, bookId, { ...index, entries });
}

export async function initNotesIndexForNewBook(dataDir: string, bookId: string): Promise<void> {
  await writeNotesIndex(dataDir, bookId, createDefaultNotesIndex());
}
