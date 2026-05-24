import { isSimilarOccurredNote } from "./characterOccurredNotes.js";
import type { ForeshadowItem, ForeshadowsIndex } from "./fsStore.js";
import { listChapters, readChapter } from "./fsStore.js";

export type HookOpAction = "plant" | "advance" | "mention" | "resolve";

export type HookOp = {
  hookId?: string;
  title?: string;
  action: HookOpAction;
  progress?: string;
};

export type SettlerDecision = {
  action: "kept" | "rejected" | "remapped";
  reason: string;
  from?: HookOp;
  to?: HookOp;
};

const CHAPTER_FILENAME_RE = /^(\d+)_(.+)\.md$/;
const GARBAGE_TITLES = new Set(["伏笔", "悬念", "未解之谜", "伏笔线", "hook", "setup", "payoff"]);
const ACTION_RANK: Record<HookOpAction, number> = { mention: 0, plant: 1, advance: 2, resolve: 3 };

export function makeForeshadowStableId(title: string): string {
  return String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function normTitleFromRaw(x: any): string {
  return String(
    x?.title || x?.item || x?.name || x?.description || x?.question || x?.hook || x?.setup || x?.payoff || ""
  ).trim();
}

function normProgressFromRaw(x: any): string {
  return String(
    x?.progress || x?.update || x?.推进 || x?.note || x?.why || x?.summary || x?.expectedResolution || x?.resolution || ""
  ).trim();
}

function normAction(raw: any): HookOpAction | null {
  const a = String(raw?.action || raw?.op || "").trim().toLowerCase();
  if (a === "plant" || a === "advance" || a === "mention" || a === "resolve") return a;
  if (a === "open" || a === "setup") return "plant";
  if (a === "close" || a === "closed" || a === "payoff") return "resolve";
  return null;
}

/** 从审计 run 解析 hookOps；兼容 ledgerUpdates.openLoops/closedLoops */
export function parseHookOpsFromRun(run: any): HookOp[] {
  const ops: HookOp[] = [];
  const rawOps = Array.isArray(run?.hookOps) ? run.hookOps : [];
  for (const raw of rawOps) {
    const action = normAction(raw);
    if (!action) continue;
    const title = normTitleFromRaw(raw);
    const hookId = String(raw?.hookId || raw?.id || "").trim();
    if (!hookId && !title) continue;
    ops.push({
      hookId: hookId || undefined,
      title: title || undefined,
      action,
      progress: normProgressFromRaw(raw) || undefined
    });
  }
  if (ops.length) return ops;

  for (const raw of run?.ledgerUpdates?.openLoops || []) {
    const title = normTitleFromRaw(raw);
    if (!title || title === "[object Object]") continue;
    const p = normProgressFromRaw(raw);
    ops.push({
      title,
      action: p ? "advance" : "mention",
      progress: p || undefined
    });
  }
  for (const raw of run?.ledgerUpdates?.closedLoops || []) {
    const title = normTitleFromRaw(raw);
    if (!title || title === "[object Object]") continue;
    ops.push({
      title,
      action: "resolve",
      progress: normProgressFromRaw(raw) || undefined
    });
  }
  return ops;
}

function isGarbageTitle(title: string): boolean {
  const t = String(title || "").trim();
  if (!t || t === "[object Object]") return true;
  if (t.length < 2) return true;
  if (GARBAGE_TITLES.has(t.toLowerCase())) return true;
  if (/^[\s\p{P}\p{S}]+$/u.test(t)) return true;
  return false;
}

/** 同批 ops 中相似标题合并为一条（保留更高优先级 action） */
export function mergeSimilarOpsInBatch(ops: HookOp[]): HookOp[] {
  if (ops.length <= 1) return ops.slice();
  const out: HookOp[] = [];
  const used = new Set<number>();

  for (let i = 0; i < ops.length; i++) {
    if (used.has(i)) continue;
    let best = { ...ops[i]! };
    used.add(i);

    for (let j = i + 1; j < ops.length; j++) {
      if (used.has(j)) continue;
      const other = ops[j]!;
      const ti = String(best.title || "").trim();
      const tj = String(other.title || "").trim();
      const sameId = Boolean(best.hookId && other.hookId && best.hookId === other.hookId);
      const similar = Boolean(ti && tj && isSimilarOccurredNote(ti, tj));
      if (!sameId && !similar) continue;

      used.add(j);
      const pickOther = ACTION_RANK[other.action] >= ACTION_RANK[best.action];
      const winner = pickOther ? other : best;
      const loser = pickOther ? best : other;
      best = {
        ...winner,
        hookId: winner.hookId || loser.hookId,
        title: String(winner.title || loser.title || "").trim() || undefined,
        progress: winner.progress || loser.progress
      };
    }
    out.push(best);
  }
  return out;
}

/**
 * Settler-lite：规则层二次校验 hookOps（拒收垃圾、纠正 id、合并同批重复）
 */
export function settlerLiteHookOps(
  ops: HookOp[],
  existingItems: ForeshadowItem[]
): { ops: HookOp[]; decisions: SettlerDecision[] } {
  const decisions: SettlerDecision[] = [];
  const byId = new Map(existingItems.map((f) => [f.id, f]));
  const openItems = existingItems.filter((f) => String(f.status || "") !== "closed");
  const kept: HookOp[] = [];

  for (const op of ops) {
    let current: HookOp = { ...op };
    const title = String(current.title || "").trim();
    const hookId = String(current.hookId || "").trim();

    if (current.action === "plant" && (!title || isGarbageTitle(title))) {
      decisions.push({ action: "rejected", reason: "garbage_or_missing_title", from: op });
      continue;
    }

    if (hookId && !byId.has(hookId) && !title && current.action !== "plant") {
      decisions.push({ action: "rejected", reason: "unknown_hookId_without_title", from: op });
      continue;
    }

    const resolvedId = findMatchingForeshadowId(title, hookId || undefined, existingItems);
    const existing = resolvedId ? byId.get(resolvedId) : undefined;

    if (hookId && resolvedId && hookId !== resolvedId && byId.has(resolvedId)) {
      current = { ...current, hookId: resolvedId, title: title || existing?.title };
      decisions.push({ action: "remapped", reason: "hookId_corrected", from: op, to: current });
    } else if (resolvedId && !current.hookId) {
      current = { ...current, hookId: resolvedId };
    }

    if (current.action === "plant" && title) {
      const dupId = findMatchingForeshadowId(title, undefined, openItems);
      const dup = dupId ? byId.get(dupId) : undefined;
      if (dup && String(dup.status || "") !== "closed") {
        current = {
          hookId: dup.id,
          title: dup.title,
          action: current.progress ? "advance" : "mention",
          progress: current.progress
        };
        decisions.push({ action: "remapped", reason: "duplicate_plant_to_mention", from: op, to: current });
      }
    }

    if (current.action === "plant" && existing?.status === "closed") {
      decisions.push({ action: "rejected", reason: "plant_on_closed", from: op });
      continue;
    }

    if (current.action === "resolve" && existing?.status === "closed" && !current.progress) {
      decisions.push({ action: "rejected", reason: "redundant_resolve", from: op });
      continue;
    }

    if (isGarbageTitle(title) && current.action !== "plant" && !hookId) {
      decisions.push({ action: "rejected", reason: "garbage_title", from: op });
      continue;
    }

    decisions.push({ action: "kept", reason: "ok", from: op, to: current });
    kept.push(current);
  }

  const merged = mergeSimilarOpsInBatch(kept);
  return { ops: settleHookOps(merged), decisions };
}

/** 规则层：同章同 id 合并，plant 遇 resolve 保留 resolve */
export function settleHookOps(ops: HookOp[]): HookOp[] {
  const byKey = new Map<string, HookOp>();
  const keyOf = (op: HookOp) => {
    const id = String(op.hookId || "").trim();
    const title = String(op.title || "").trim();
    return id || makeForeshadowStableId(title);
  };
  const rank: Record<HookOpAction, number> = { mention: 0, plant: 1, advance: 2, resolve: 3 };
  for (const op of ops) {
    const k = keyOf(op);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || rank[op.action] >= rank[prev.action]) {
      byKey.set(k, {
        ...prev,
        ...op,
        hookId: op.hookId || prev?.hookId,
        title: op.title || prev?.title,
        progress: op.progress || prev?.progress
      });
    }
  }
  return [...byKey.values()];
}

export function findMatchingForeshadowId(
  title: string,
  hookId: string | undefined,
  items: ForeshadowItem[]
): string | null {
  const byId = new Map(items.map((f) => [f.id, f]));
  if (hookId && byId.has(hookId)) return hookId;
  const t = String(title || "").trim();
  if (!t) return null;
  const stable = makeForeshadowStableId(t);
  if (byId.has(stable)) return stable;
  for (const f of items) {
    if (isSimilarOccurredNote(t, f.title)) return f.id;
  }
  return stable;
}

function pushChapter(f: ForeshadowItem, chap: number) {
  if (!Number.isFinite(chap)) return;
  f.firstChapter = Number.isFinite(f.firstChapter) ? Math.min(f.firstChapter!, chap) : chap;
  f.lastChapter = Number.isFinite(f.lastChapter) ? Math.max(f.lastChapter!, chap) : chap;
  const arr = Array.isArray(f.chapters)
    ? f.chapters.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n))
    : [];
  if (!arr.includes(chap)) arr.push(chap);
  arr.sort((a, b) => a - b);
  f.chapters = arr;
}

function pushActivity(f: ForeshadowItem, chap: number, note: string) {
  if (!Number.isFinite(chap) || !note) return;
  if (!f.chapterActivity || typeof f.chapterActivity !== "object") f.chapterActivity = {};
  f.chapterActivity[String(chap)] = note;
}

function activityNote(op: HookOp): string {
  const p = String(op.progress || "").trim();
  if (p) return p;
  if (op.action === "resolve") return "本章回收";
  if (op.action === "advance") return "本章推进";
  if (op.action === "plant") return "新埋设";
  return "本章提及";
}

export function applyHookOpsToForeshadowsIndex(
  foIdx: ForeshadowsIndex,
  ops: HookOp[],
  chapterNo: number | null,
  auditedAt: string,
  options?: { skipSettler?: boolean }
): ForeshadowsIndex {
  const existing = (foIdx.foreshadows || []) as ForeshadowItem[];
  const prepared = options?.skipSettler ? settleHookOps(ops) : settlerLiteHookOps(ops, existing).ops;
  const settled = prepared;
  const byId = new Map<string, ForeshadowItem>(
    (foIdx.foreshadows || [])
      .map((f) => ({ ...f, id: String(f?.id || "").trim() }))
      .filter((f) => f.id)
      .map((f) => [f.id, f as ForeshadowItem])
  );
  const chap = Number.isFinite(chapterNo) ? Number(chapterNo) : NaN;
  const now = auditedAt || new Date().toISOString();

  for (const op of settled) {
    const title = String(op.title || "").trim();
    const items = [...byId.values()];
    const resolvedId = findMatchingForeshadowId(title, op.hookId, items);
    if (!resolvedId) continue;

    let prev = byId.get(resolvedId);
    if (!prev) {
      if (!title) continue;
      prev = {
        id: resolvedId,
        title,
        status: "open",
        updatedAt: now
      };
    } else if (title && !isSimilarOccurredNote(title, prev.title)) {
      // 保留更长/更具体的标题
      if (title.length > prev.title.length) prev.title = title;
    } else if (title) {
      prev.title = prev.title || title;
    }

    const note = activityNote(op);
    if (op.action === "resolve") {
      prev.status = "closed";
      if (op.progress) prev.lastProgress = op.progress;
    } else if (op.action === "advance") {
      if (prev.status !== "closed") prev.status = "progress";
      if (op.progress) prev.lastProgress = op.progress;
    } else if (op.action === "plant") {
      if (prev.status !== "closed") prev.status = "open";
      if (op.progress) prev.lastProgress = op.progress;
    } else if (op.action === "mention") {
      if (op.progress) prev.lastProgress = op.progress;
    }

    if (Number.isFinite(chap)) pushChapter(prev, chap);
    if (Number.isFinite(chap)) pushActivity(prev, chap, note);
    prev.updatedAt = now;
    byId.set(resolvedId, prev);
  }

  foIdx.foreshadows = [...byId.values()]
    .filter((f) => {
      const t = String(f?.title || "").trim();
      return t && t !== "[object Object]";
    })
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN"));
  if (!Array.isArray(foIdx.hiddenIds)) foIdx.hiddenIds = [];
  foIdx.updatedAt = now;
  return foIdx;
}

export function listOpenForeshadowsForAudit(foIdx: ForeshadowsIndex) {
  const hidden = new Set((foIdx.hiddenIds || []).map((x) => String(x)));
  return (foIdx.foreshadows || [])
    .filter((f) => !hidden.has(f.id) && String(f.status || "") !== "closed")
    .map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      lastChapter: f.lastChapter,
      lastProgress: f.lastProgress
    }));
}

/** 从章节正文截取与伏笔标题相关的种子片段 */
export function extractSeedExcerpt(content: string, title: string, maxLen = 200): string {
  const text = String(content || "").replace(/\r/g, "").trim();
  if (!text) return "";
  const t = String(title || "").trim();
  const needle = t.length >= 4 ? t.slice(0, Math.min(12, t.length)) : "";
  let idx = needle ? text.indexOf(needle) : -1;
  if (idx < 0 && t.length >= 2) {
    const parts = t.split(/[\s，,、；;：:]+/).filter((p) => p.length >= 2);
    for (const p of parts) {
      idx = text.indexOf(p);
      if (idx >= 0) break;
    }
  }
  if (idx < 0) return text.slice(0, maxLen).trim();

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + maxLen);
  let excerpt = text.slice(start, end).trim();
  const sentences = excerpt.split(/(?<=[。！？!?…\n])/);
  if (sentences.length > 2) {
    excerpt = sentences.slice(-2).join("").trim() || excerpt;
  }
  return excerpt.slice(0, maxLen).trim();
}

function chapterFilenameForNo(chapterFiles: string[], chapterNo: number): string | null {
  for (const name of chapterFiles) {
    const m = name.match(CHAPTER_FILENAME_RE);
    if (m && Number(m[1]) === chapterNo) return name;
  }
  return null;
}

export async function enrichForeshadowCandidatesWithSeedExcerpts(
  dataDir: string,
  novelSlug: string,
  candidates: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const chapterMetas = await listChapters(dataDir, novelSlug);
  const filenames = chapterMetas.map((m) => m.filename);
  const out: Array<Record<string, unknown>> = [];
  for (const c of candidates) {
    const fc = Number(c.firstChapter);
    if (!Number.isFinite(fc)) {
      out.push(c);
      continue;
    }
    const filename = chapterFilenameForNo(filenames, fc);
    if (!filename) {
      out.push(c);
      continue;
    }
    try {
      const content = await readChapter(dataDir, novelSlug, filename);
      const seedExcerpt = extractSeedExcerpt(content, String(c.title || ""));
      out.push(seedExcerpt ? { ...c, seedExcerpt } : c);
    } catch {
      out.push(c);
    }
  }
  return out;
}

export function isForeshadowActionable(f: ForeshadowItem, currentChapterNo: number | null, staleGap = 3): boolean {
  const st = String(f.status || "open");
  if (st === "closed") return false;
  if (!Number.isFinite(currentChapterNo)) return st === "open" || st === "progress";
  const cur = Number(currentChapterNo);
  const last = Number(f.lastChapter);
  if (!Number.isFinite(last)) return true;
  return cur - last >= staleGap;
}

export function latestChapterActivity(f: ForeshadowItem): string {
  const act = f.chapterActivity;
  if (!act || typeof act !== "object") return "";
  const keys = Object.keys(act)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  if (!keys.length) return "";
  return String(act[String(keys[0]!)] || "").trim();
}

export function foreshadowStaleGap(
  f: ForeshadowItem,
  currentChapterNo: number | null,
  staleGap = 3
): number | null {
  const st = String(f.status || "open");
  if (st === "closed") return null;
  if (!Number.isFinite(currentChapterNo)) return null;
  const cur = Number(currentChapterNo);
  const last = Number(f.lastChapter);
  if (!Number.isFinite(last)) return null;
  const gap = cur - last;
  return gap >= staleGap ? gap : null;
}

export type ForeshadowHealthItem = {
  id: string;
  title: string;
  status: string;
  stale: boolean;
  staleGap: number | null;
  firstChapter?: number;
  lastChapter?: number;
  lastProgress?: string;
  recommendation?: string;
};

export type ForeshadowHealthReport = {
  summary: {
    total: number;
    open: number;
    progress: number;
    closed: number;
    stale: number;
    actionable: number;
  };
  items: ForeshadowHealthItem[];
};

/** 伏笔健康度只读报告（Continuity-lite） */
export function buildForeshadowHealthReport(
  foIdx: ForeshadowsIndex,
  currentChapterNo: number | null,
  staleGap = 3
): ForeshadowHealthReport {
  const hidden = new Set((foIdx.hiddenIds || []).map((x) => String(x)));
  const visible = (foIdx.foreshadows || []).filter((f) => !hidden.has(f.id));

  let open = 0;
  let progress = 0;
  let closed = 0;
  let stale = 0;

  const items: ForeshadowHealthItem[] = visible.map((f) => {
    const st = String(f.status || "open");
    if (st === "closed") closed++;
    else if (st === "progress") progress++;
    else open++;

    const gap = foreshadowStaleGap(f, currentChapterNo, staleGap);
    const isStale = gap !== null;
    if (isStale) stale++;

    let recommendation: string | undefined;
    if (isStale && gap !== null) {
      recommendation = gap >= 8 ? "建议尽快回收或实质推进" : "可考虑在本章提及或推进";
    } else if (st === "open" && !Number.isFinite(f.lastChapter)) {
      recommendation = "已埋设但尚未在后续章节出现";
    }

    return {
      id: f.id,
      title: f.title,
      status: st,
      stale: isStale,
      staleGap: gap,
      firstChapter: f.firstChapter,
      lastChapter: f.lastChapter,
      lastProgress: f.lastProgress,
      recommendation
    };
  });

  items.sort((a, b) => {
    const ga = a.staleGap ?? -1;
    const gb = b.staleGap ?? -1;
    if (gb !== ga) return gb - ga;
    return String(a.title).localeCompare(String(b.title), "zh-Hans-CN");
  });

  return {
    summary: {
      total: visible.length,
      open,
      progress,
      closed,
      stale,
      actionable: stale + open
    },
    items
  };
}
