import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BUILT_IN_GUIDANCE_NOTEBOOK_ID,
  BUILT_IN_GUIDANCE_NOTEBOOK_NAME,
  DEFAULT_GUIDANCE_SESSION_TITLE,
  MAX_GUIDANCE_MODEL_MESSAGES,
  MAX_GUIDANCE_SESSION_MESSAGES,
  MAX_GUIDANCE_SESSION_TURNS,
  MAX_GUIDANCE_USER_MESSAGE_LEN,
  type GuidanceMessage,
  type GuidanceNotebook,
  type GuidanceSession,
  type GuidanceTurn,
  type GuidanceTurnPart,
  type WritingGuidanceIndex
} from "./types.js";
import { splitAssistantSessionTitle } from "./parseReply.js";

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

export function migrateMessagesToTurns(
  messages: Array<{ role: string; content: string; createdAt: string }>
): GuidanceTurn[] {
  const turns: GuidanceTurn[] = [];
  let pendingUser: GuidanceTurnPart | null = null;
  for (const m of messages) {
    if (m.role === "user") {
      if (pendingUser) {
        turns.push({
          id: crypto.randomUUID(),
          user: pendingUser,
          assistant: { content: "", createdAt: pendingUser.createdAt }
        });
      }
      const content = String(m.content || "").trim();
      if (!content) continue;
      pendingUser = {
        content: content.slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN),
        createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString()
      };
    } else if (m.role === "assistant" && pendingUser) {
      turns.push({
        id: crypto.randomUUID(),
        user: pendingUser,
        assistant: {
          content: String(m.content || "")
            .trim()
            .slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN * 4),
          createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString()
        }
      });
      pendingUser = null;
    }
  }
  if (pendingUser) {
    turns.push({
      id: crypto.randomUUID(),
      user: pendingUser,
      assistant: { content: "", createdAt: pendingUser.createdAt }
    });
  }
  if (turns.length > MAX_GUIDANCE_SESSION_TURNS) {
    return turns.slice(-MAX_GUIDANCE_SESSION_TURNS);
  }
  return turns;
}

function normalizeTurn(raw: unknown): GuidanceTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as GuidanceTurn;
  const id = String(o.id || "").trim();
  if (!id) return null;
  const userContent = String(o.user?.content ?? "").trim();
  if (!userContent) return null;
  const now = new Date().toISOString();
  const userCreated = typeof o.user?.createdAt === "string" ? o.user.createdAt : now;
  const assistantCreated =
    typeof o.assistant?.createdAt === "string" ? o.assistant.createdAt : userCreated;
  return {
    id,
    user: {
      content: userContent.slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN),
      createdAt: userCreated
    },
    assistant: {
      content: String(o.assistant?.content ?? "")
        .trim()
        .slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN * 4),
      createdAt: assistantCreated
    },
    ...(o.hidden ? { hidden: true } : {}),
    ...(o.starred ? { starred: true } : {})
  };
}

export function createDefaultGuidanceIndex(): WritingGuidanceIndex {
  const now = new Date().toISOString();
  return {
    version: 2,
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
  const o = raw as GuidanceSession & { messages?: GuidanceMessage[] };
  const id = String(o.id || "").trim();
  const notebookId = String(o.notebookId || "").trim();
  if (!id || !notebookId) return null;

  let turns: GuidanceTurn[] = [];
  if (Array.isArray(o.turns)) {
    for (const t of o.turns) {
      const turn = normalizeTurn(t);
      if (turn) turns.push(turn);
    }
  }
  if (turns.length === 0 && Array.isArray(o.messages)) {
    const legacy: GuidanceMessage[] = [];
    for (const m of o.messages) {
      const msg = normalizeMessage(m);
      if (msg) legacy.push(msg);
    }
    if (legacy.length > 0) turns = migrateMessagesToTurns(legacy);
  }
  if (turns.length > MAX_GUIDANCE_SESSION_TURNS) {
    turns = turns.slice(-MAX_GUIDANCE_SESSION_TURNS);
  }

  const now = new Date().toISOString();
  const title = String(o.title || "").trim() || DEFAULT_GUIDANCE_SESSION_TITLE;
  const order = Number.isFinite(o.order) ? Number(o.order) : NaN;
  return {
    id,
    notebookId,
    title: title.slice(0, 120),
    turns,
    ...(o.starred ? { starred: true } : {}),
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
    version: 2,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
    notebooks,
    sessions: ensureSessionOrders(sessions)
  };
}

export function trimMessagesForModel(messages: GuidanceMessage[]): GuidanceMessage[] {
  if (messages.length <= MAX_GUIDANCE_MODEL_MESSAGES) return messages;
  return messages.slice(-MAX_GUIDANCE_MODEL_MESSAGES);
}

export function turnsForModel(turns: GuidanceTurn[]): GuidanceMessage[] {
  const out: GuidanceMessage[] = [];
  for (const t of turns) {
    if (t.hidden) continue;
    const userText = t.user.content.trim();
    const assistantText = t.assistant.content.trim();
    if (!userText || !assistantText) continue;
    out.push({ role: "user", content: userText, createdAt: t.user.createdAt });
    out.push({
      role: "assistant",
      content: assistantText,
      createdAt: t.assistant.createdAt
    });
  }
  return trimMessagesForModel(out);
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
    turns: [],
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
  patch: { title?: string; notebookId?: string; starred?: boolean }
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
    ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
    order,
    updatedAt: now
  };
  const sessions = [...index.sessions];
  sessions[i] = nextSession;
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export async function patchTurn(
  dataDir: string,
  bookId: string,
  sessionId: string,
  turnId: string,
  patch: { hidden?: boolean; starred?: boolean }
): Promise<WritingGuidanceIndex> {
  const index = await ensureGuidanceIndex(dataDir, bookId);
  const i = index.sessions.findIndex((s) => s.id === sessionId);
  if (i < 0) throw new Error("Not found");
  const current = index.sessions[i]!;
  const ti = current.turns.findIndex((t) => t.id === turnId);
  if (ti < 0) throw new Error("Not found");
  const turn = current.turns[ti]!;
  const nextTurn: GuidanceTurn = {
    ...turn,
    ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
    ...(patch.starred !== undefined ? { starred: patch.starred } : {})
  };
  const turns = [...current.turns];
  turns[ti] = nextTurn;
  const sessions = [...index.sessions];
  sessions[i] = { ...current, turns, updatedAt: new Date().toISOString() };
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
  if (session.turns.length >= MAX_GUIDANCE_SESSION_TURNS) {
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
  const rawAssistant = assistantContent.trim();
  if (!text || !rawAssistant) throw new Error("Content required");
  const isFirstTurn = current.turns.length === 0;
  const parsed = isFirstTurn
    ? splitAssistantSessionTitle(rawAssistant)
    : { content: rawAssistant };
  const assistant = parsed.content.slice(0, MAX_GUIDANCE_USER_MESSAGE_LEN * 4);
  if (!assistant) throw new Error("Content required");
  const now = new Date().toISOString();
  const userPart: GuidanceTurnPart = { content: text, createdAt: now };
  const assistantPart: GuidanceTurnPart = { content: assistant, createdAt: now };
  let title = current.title;
  const turn: GuidanceTurn = {
    id: crypto.randomUUID(),
    user: userPart,
    assistant: assistantPart
  };
  if (isFirstTurn) {
    if (parsed.sessionTitle) {
      title = parsed.sessionTitle.slice(0, 120);
    } else if (title === DEFAULT_GUIDANCE_SESSION_TITLE) {
      title = text.slice(0, 14);
    }
  }
  const nextSession: GuidanceSession = {
    ...current,
    title,
    turns: [...current.turns, turn],
    updatedAt: now
  };
  const sessions = [...index.sessions];
  sessions[i] = nextSession;
  return writeGuidanceIndex(dataDir, bookId, { ...index, sessions });
}

export async function initWritingGuidanceIndexForNewBook(dataDir: string, bookId: string): Promise<void> {
  await writeGuidanceIndex(dataDir, bookId, createDefaultGuidanceIndex());
}
