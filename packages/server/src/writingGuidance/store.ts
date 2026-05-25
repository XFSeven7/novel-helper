import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUILT_IN_GUIDANCE_NOTEBOOK_ID,
  BUILT_IN_GUIDANCE_NOTEBOOK_NAME,
  DEFAULT_GUIDANCE_SESSION_TITLE,
  MAX_GUIDANCE_MODEL_MESSAGES,
  MAX_GUIDANCE_SESSION_MESSAGES,
  MAX_GUIDANCE_USER_MESSAGE_LEN,
  type GuidanceMessage,
  type GuidanceNotebook,
  type GuidanceSession,
  type WritingGuidanceIndex
} from "./types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function guidanceIndexPath(dataDir: string, bookId: string) {
  return path.join(dataDir, bookId, "writing-guidance", "index.json");
}

export function createDefaultGuidanceIndex(): WritingGuidanceIndex {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    notebooks: [
      {
        id: BUILT_IN_GUIDANCE_NOTEBOOK_ID,
        name: BUILT_IN_GUIDANCE_NOTEBOOK_NAME,
        builtIn: true,
        order: 0
      }
    ],
    sessions: []
  };
}

function normalizeNotebook(raw: unknown, fallbackOrder: number): GuidanceNotebook | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as GuidanceNotebook;
  const id = String(o.id || "").trim();
  const name = String(o.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    builtIn: Boolean(o.builtIn) || id === BUILT_IN_GUIDANCE_NOTEBOOK_ID,
    order: Number.isFinite(o.order) ? Number(o.order) : fallbackOrder
  };
}

function normalizeMessage(raw: unknown): GuidanceMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as GuidanceMessage;
  const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : null;
  const content = String(o.content || "").trim();
  if (!role || !content) return null;
  return {
    role,
    content: content.slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString()
  };
}

function normalizeSession(raw: unknown): GuidanceSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as GuidanceSession;
  const id = String(o.id || "").trim();
  const notebookId = String(o.notebookId || "").trim();
  if (!id || !notebookId) return null;
  const messages: GuidanceMessage[] = [];
  if (Array.isArray(o.messages)) {
    for (const m of o.messages) {
      const msg = normalizeMessage(m);
      if (msg) messages.push(msg);
    }
  }
  if (messages.length > MAX_GUIDANCE_SESSION_MESSAGES) {
    messages.splice(0, messages.length - MAX_GUIDANCE_SESSION_MESSAGES);
  }
  const now = new Date().toISOString();
  const title = String(o.title || "").trim() || DEFAULT_GUIDANCE_SESSION_TITLE;
  const order = Number.isFinite((o as GuidanceSession).order) ? Number((o as GuidanceSession).order) : NaN;
  return {
    id,
    notebookId,
    title: title.slice(0, 120),
    messages,
    order,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now
  };
}

function ensureSessionOrders(sessions: GuidanceSession[]): GuidanceSession[] {
  const byNotebook = new Map<string, GuidanceSession[]>();
  for (const s of sessions) {
    const list = byNotebook.get(s.notebookId) ?? [];
    list.push(s);
    byNotebook.set(s.notebookId, list);
  }
  const out: GuidanceSession[] = [];
  for (const list of byNotebook.values()) {
    const needsInit = list.some((s) => !Number.isFinite(s.order));
    if (needsInit) {
      const sorted = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      sorted.forEach((s, i) => out.push({ ...s, order: i }));
    } else {
      out.push(...list);
    }
  }
  return out;
}

function maxOrderInNotebook(sessions: GuidanceSession[], notebookId: string): number {
  let max = -1;
  for (const s of sessions) {
    if (s.notebookId !== notebookId) continue;
    if (Number.isFinite(s.order) && s.order > max) max = s.order;
  }
  return max;
}

export function normalizeGuidanceIndex(parsed: unknown): WritingGuidanceIndex {
  const base = createDefaultGuidanceIndex();
  if (!parsed || typeof parsed !== "object") return base;

  const p = parsed as WritingGuidanceIndex;
  const notebooks: GuidanceNotebook[] = [];
  if (Array.isArray(p.notebooks)) {
    p.notebooks.forEach((n, i) => {
      const nb = normalizeNotebook(n, i);
      if (nb) notebooks.push(nb);
    });
  }
  if (!notebooks.some((n) => n.id === BUILT_IN_GUIDANCE_NOTEBOOK_ID)) {
    notebooks.unshift({
      id: BUILT_IN_GUIDANCE_NOTEBOOK_ID,
      name: BUILT_IN_GUIDANCE_NOTEBOOK_NAME,
      builtIn: true,
      order: 0
    });
  }
  notebooks.sort((a, b) => a.order - b.order);

  const notebookIds = new Set(notebooks.map((n) => n.id));
  const sessions: GuidanceSession[] = [];
  if (Array.isArray(p.sessions)) {
    for (const s of p.sessions) {
      const sess = normalizeSession(s);
      if (sess && notebookIds.has(sess.notebookId)) sessions.push(sess);
    }
  }

  return {
    version: 1,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
    notebooks,
    sessions: ensureSessionOrders(sessions)
  };
}

export function trimMessagesForModel(messages: GuidanceMessage[]): GuidanceMessage[] {
  if (messages.length <= MAX_GUIDANCE_MODEL_MESSAGES) return messages;
  return messages.slice(-MAX_GUIDANCE_MODEL_MESSAGES);
}

export async function readGuidanceIndex(
  dataDir: string,
  bookId: string
): Promise<WritingGuidanceIndex | null> {
  const p = guidanceIndexPath(dataDir, bookId);
  if (!(await exists(p))) return null;
  const raw = await fs.readFile(p, "utf8");
  return normalizeGuidanceIndex(JSON.parse(raw));
}

export async function writeGuidanceIndex(
  dataDir: string,
  bookId: string,
  index: WritingGuidanceIndex
): Promise<WritingGuidanceIndex> {
  const dir = path.join(dataDir, bookId, "writing-guidance");
  await fs.mkdir(dir, { recursive: true });
  const next: WritingGuidanceIndex = {
    ...normalizeGuidanceIndex(index),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(guidanceIndexPath(dataDir, bookId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function ensureGuidanceIndex(dataDir: string, bookId: string): Promise<WritingGuidanceIndex> {
  const existing = await readGuidanceIndex(dataDir, bookId);
  if (existing) return existing;
  return writeGuidanceIndex(dataDir, bookId, createDefaultGuidanceIndex());
}

function findNotebook(index: WritingGuidanceIndex, notebookId: string) {
  return index.notebooks.find((n) => n.id === notebookId);
}

function findSession(index: WritingGuidanceIndex, sessionId: string) {
  return index.sessions.find((s) => s.id === sessionId);
}

export async function addNotebook(dataDir: string, bookId: string, name: string): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const trimmed = name.trim() || "新笔记本";
  const maxOrder = index.notebooks.reduce((m, n) => Math.max(m, n.order), -1);
  const notebook: GuidanceNotebook = {
    id: crypto.randomUUID(),
    name: trimmed,
    order: maxOrder + 1
  };
  return writeGuidanceIndex(dataDir, bookId, {
    ...index,
    notebooks: [...index.notebooks, notebook]
  });
}

export async function patchNotebook(
  dataDir: string,
  bookId: string,
  notebookId: string,
  patch: { name?: string; order?: number }
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
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
  return writeGuidanceIndex(dataDir, bookId, { ...index, notebooks });
}

export async function deleteNotebook(
  dataDir: string,
  bookId: string,
  notebookId: string
): Promise<{ index: WritingGuidanceIndex; sessionCount: number }> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const nb = findNotebook(index, notebookId);
  if (!nb) throw new Error("Not found");
  if (nb.builtIn || notebookId === BUILT_IN_GUIDANCE_NOTEBOOK_ID) {
    throw new Error("Cannot delete built-in notebook");
  }
  const sessionCount = index.sessions.filter((s) => s.notebookId === notebookId).length;
  if (sessionCount > 0) {
    const err = new Error("Notebook has sessions") as Error & { sessionCount: number };
    err.sessionCount = sessionCount;
    throw err;
  }
  const notebooks = index.notebooks.filter((n) => n.id !== notebookId);
  return { index: await writeGuidanceIndex(dataDir, bookId, { ...index, notebooks }), sessionCount: 0 };
}

export async function addSession(
  dataDir: string,
  bookId: string,
  input: { notebookId: string; title?: string }
): Promise<{ index: WritingGuidanceIndex; sessionId: string }> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  if (!findNotebook(index, input.notebookId)) throw new Error("Notebook not found");
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const title = String(input.title || "").trim() || DEFAULT_GUIDANCE_SESSION_TITLE;
  const session: GuidanceSession = {
    id: sessionId,
    notebookId: input.notebookId,
    title: title.slice(0, 120),
    messages: [],
    order: maxOrderInNotebook(index.sessions, input.notebookId) + 1,
    createdAt: now,
    updatedAt: now
  };
  const next = await writeGuidanceIndex(dataDir, bookId, {
    ...index,
    sessions: [...index.sessions, session]
  });
  return { index: next, sessionId };
}

export async function patchSession(
  dataDir: string,
  bookId: string,
  sessionId: string,
  patch: { title?: string; notebookId?: string }
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const i = index.sessions.findIndex((s) => s.id === sessionId);
  if (i < 0) throw new Error("Not found");
  const current = index.sessions[i]!;
  if (patch.notebookId !== undefined && !findNotebook(index, patch.notebookId)) {
    throw new Error("Notebook not found");
  }
  const now = new Date().toISOString();
  const targetNotebookId = patch.notebookId ?? current.notebookId;
  let order = current.order;
  if (patch.notebookId !== undefined && patch.notebookId !== current.notebookId) {
    order = maxOrderInNotebook(index.sessions, patch.notebookId) + 1;
  }
  const nextSession: GuidanceSession = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 120) || current.title } : {}),
    ...(patch.notebookId !== undefined ? { notebookId: patch.notebookId } : {}),
    order,
    updatedAt: now
  };
  const sessions = [...index.sessions];
  sessions[i] = nextSession;
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export async function reorderSessions(
  dataDir: string,
  bookId: string,
  notebookId: string,
  sessionIds: string[]
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  if (!findNotebook(index, notebookId)) throw new Error("Notebook not found");
  const inNotebook = index.sessions.filter((s) => s.notebookId === notebookId);
  const idSet = new Set(sessionIds);
  if (idSet.size !== sessionIds.length) throw new Error("Duplicate session id");
  if (idSet.size !== inNotebook.length) throw new Error("Session list mismatch");
  for (const s of inNotebook) {
    if (!idSet.has(s.id)) throw new Error("Session list mismatch");
  }
  const orderMap = new Map(sessionIds.map((id, i) => [id, i]));
  const sessions = index.sessions.map((s) => {
    if (s.notebookId !== notebookId) return s;
    return { ...s, order: orderMap.get(s.id) ?? s.order };
  });
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export async function deleteSession(
  dataDir: string,
  bookId: string,
  sessionId: string
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const sessions = index.sessions.filter((s) => s.id !== sessionId);
  if (sessions.length === index.sessions.length) throw new Error("Not found");
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export function getSessionForChat(index: WritingGuidanceIndex, sessionId: string): GuidanceSession {
  const session = findSession(index, sessionId);
  if (!session) throw new Error("Not found");
  if (session.messages.length >= MAX_GUIDANCE_SESSION_MESSAGES) {
    throw new Error("Session message limit");
  }
  return session;
}

export async function appendChatTurn(
  dataDir: string,
  bookId: string,
  sessionId: string,
  userContent: string,
  assistantContent: string
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const i = index.sessions.findIndex((s) => s.id === sessionId);
  if (i < 0) throw new Error("Not found");
  const current = index.sessions[i]!;
  const text = userContent.trim().slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN);
  const assistant = assistantContent.trim().slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN * 4);
  if (!text || !assistant) throw new Error("Content required");
  const now = new Date().toISOString();
  const userMsg: GuidanceMessage = { role: "user", content: text, createdAt: now };
  const assistantMsg: GuidanceMessage = { role: "assistant", content: assistant, createdAt: now };
  let title = current.title;
  if (current.messages.length === 0 && title === DEFAULT_GUIDANCE_SESSION_TITLE) {
    title = text.slice(0, 40);
  }
  const nextSession: GuidanceSession = {
    ...current,
    title,
    messages: [...current.messages, userMsg, assistantMsg],
    updatedAt: now
  };
  const sessions = [...index.sessions];
  sessions[i] = nextSession;
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export async function initWritingGuidanceIndexForNewBook(dataDir: string, bookId: string): Promise<void> {
  await writeGuidanceIndex(dataDir, bookId, createDefaultGuidanceIndex());
}
