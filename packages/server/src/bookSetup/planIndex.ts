import fs from "node:fs/promises";
import path from "node:path";
import type { BookSetupDraft, BookSetupStepId } from "./types.js";
import { readSession, deleteSession } from "./sessionStore.js";

export type BookSetupPlanEntry = {
  sessionId: string;
  registeredAt: string;
  updatedAt: string;
  displayTitle: string;
  currentStep: BookSetupStepId;
  readyToCreate: boolean;
};

type BookSetupPlanIndex = {
  version: 1;
  plans: BookSetupPlanEntry[];
};

function indexPath(dataDir: string) {
  return path.join(dataDir, "_sessions", "book-setup", "index.json");
}

function displayTitleFromDraft(draft: BookSetupDraft): string {
  const t = draft.title?.trim();
  return t || "未命名规划";
}

function entryFromDraft(sessionId: string, draft: BookSetupDraft, registeredAt?: string): BookSetupPlanEntry {
  const now = draft.updatedAt || new Date().toISOString();
  return {
    sessionId,
    registeredAt: registeredAt ?? now,
    updatedAt: now,
    displayTitle: displayTitleFromDraft(draft),
    currentStep: draft.currentStep,
    readyToCreate: Boolean(draft.readyToCreate)
  };
}

async function readIndex(dataDir: string): Promise<BookSetupPlanIndex> {
  try {
    const raw = await fs.readFile(indexPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as BookSetupPlanIndex;
    if (parsed.version === 1 && Array.isArray(parsed.plans)) return parsed;
  } catch {
    /* missing or corrupt */
  }
  return { version: 1, plans: [] };
}

async function writeIndexFile(dataDir: string, index: BookSetupPlanIndex): Promise<void> {
  const dir = path.dirname(indexPath(dataDir));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(indexPath(dataDir), JSON.stringify(index, null, 2), "utf8");
}

export async function listPlans(dataDir: string): Promise<BookSetupPlanEntry[]> {
  const index = await readIndex(dataDir);
  const valid: BookSetupPlanEntry[] = [];
  let changed = false;

  for (const entry of index.plans) {
    const draft = await readSession(dataDir, entry.sessionId);
    if (!draft) {
      changed = true;
      continue;
    }
    const fresh = entryFromDraft(entry.sessionId, draft, entry.registeredAt);
    if (
      fresh.updatedAt !== entry.updatedAt ||
      fresh.displayTitle !== entry.displayTitle ||
      fresh.currentStep !== entry.currentStep ||
      fresh.readyToCreate !== entry.readyToCreate
    ) {
      changed = true;
    }
    valid.push(fresh);
  }

  if (changed) {
    valid.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    await writeIndexFile(dataDir, { version: 1, plans: valid });
  }

  return valid.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function isPlanRegistered(dataDir: string, sessionId: string): Promise<boolean> {
  const index = await readIndex(dataDir);
  return index.plans.some((p) => p.sessionId === sessionId);
}

export async function registerPlan(dataDir: string, sessionId: string, draft: BookSetupDraft): Promise<BookSetupPlanEntry> {
  const index = await readIndex(dataDir);
  const existing = index.plans.find((p) => p.sessionId === sessionId);
  const entry = entryFromDraft(sessionId, draft, existing?.registeredAt);
  const nextPlans = existing
    ? index.plans.map((p) => (p.sessionId === sessionId ? entry : p))
    : [...index.plans, entry];
  await writeIndexFile(dataDir, { version: 1, plans: nextPlans });
  return entry;
}

export async function updatePlanFromDraft(dataDir: string, sessionId: string, draft: BookSetupDraft): Promise<void> {
  const index = await readIndex(dataDir);
  if (!index.plans.some((p) => p.sessionId === sessionId)) return;
  const entry = entryFromDraft(sessionId, draft, index.plans.find((p) => p.sessionId === sessionId)!.registeredAt);
  await writeIndexFile(dataDir, {
    version: 1,
    plans: index.plans.map((p) => (p.sessionId === sessionId ? entry : p))
  });
}

export async function removePlan(dataDir: string, sessionId: string): Promise<void> {
  const index = await readIndex(dataDir);
  const next = index.plans.filter((p) => p.sessionId !== sessionId);
  if (next.length !== index.plans.length) {
    await writeIndexFile(dataDir, { version: 1, plans: next });
  }
}

export async function discardPlan(dataDir: string, sessionId: string): Promise<void> {
  await removePlan(dataDir, sessionId);
  await deleteSession(dataDir, sessionId);
}
