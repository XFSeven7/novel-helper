import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { BookSetupDraft } from "./types.js";
import { createEmptyDraft, touchDraft } from "./draft.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionsDir(dataDir: string) {
  return path.join(dataDir, "_sessions", "book-setup");
}

function sessionPath(dataDir: string, sessionId: string) {
  return path.join(sessionsDir(dataDir), `${sessionId}.json`);
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export async function createSession(dataDir: string): Promise<{ sessionId: string; draft: BookSetupDraft }> {
  await fs.mkdir(sessionsDir(dataDir), { recursive: true });
  const sessionId = newSessionId();
  const draft = createEmptyDraft();
  await fs.writeFile(sessionPath(dataDir, sessionId), JSON.stringify(draft, null, 2), "utf8");
  return { sessionId, draft };
}

export async function readSession(
  dataDir: string,
  sessionId: string
): Promise<BookSetupDraft | null> {
  const p = sessionPath(dataDir, sessionId);
  if (!(await exists(p))) return null;
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as BookSetupDraft;
  if (parsed.version !== 1) return null;
  const updated = Date.parse(parsed.updatedAt || "");
  if (Number.isFinite(updated) && Date.now() - updated > SESSION_TTL_MS) {
    await fs.unlink(p).catch(() => undefined);
    return null;
  }
  return touchDraft(parsed);
}

export async function writeSession(dataDir: string, sessionId: string, draft: BookSetupDraft): Promise<BookSetupDraft> {
  await fs.mkdir(sessionsDir(dataDir), { recursive: true });
  const next = touchDraft(draft);
  await fs.writeFile(sessionPath(dataDir, sessionId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function deleteSession(dataDir: string, sessionId: string): Promise<void> {
  const p = sessionPath(dataDir, sessionId);
  if (await exists(p)) await fs.unlink(p);
}
