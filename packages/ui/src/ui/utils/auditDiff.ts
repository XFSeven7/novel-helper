import { formatAuditCharField } from "./auditCharacters";
import type { StoryFile } from "../api";

export function friendlyAuditFieldKey(k: string): string {
  const map: Record<string, string> = {
    personality: "性格",
    motivation: "动机",
    speechStyle: "说话风格",
    relationships: "关系",
    appearance: "外貌",
    contrast: "反差",
    known: "已知信息",
    unknown: "未知 / 伏笔",
    summary: "概要",
    notes: "备注",
    currentScene: "当前戏份",
    emotion: "情绪",
    arcHint: "弧线提示",
    goal: "目标",
    faction: "阵营",
    age: "年龄",
    aliases: "别名"
  };
  return map[k] ?? k;
}

export type AuditLinkKind = "character" | "place" | "org" | "timelineEvent" | "storyFile";

export type AuditLinkTarget = {
  kind: AuditLinkKind;
  id: string;
  display: string;
  summaryLines: string[];
  jump: { tab: "chapterAnalysis" | "auditCharacters" | "places" | "orgs" | "timeline" | "story"; key: string };
};

export function splitParagraphs(raw: string): string[] {
  const t = (raw || "").replace(/\r/g, "").trim();
  if (!t) return [];
  return t
    .split(/\n{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type DiffSeg = { t: "eq" | "ins" | "del"; s: string };

export function diffChars(aRaw: string, bRaw: string): DiffSeg[] {
  const a = (aRaw || "").replace(/\r/g, "");
  const b = (bRaw || "").replace(/\r/g, "");
  if (!a && !b) return [];
  if (!a) return [{ t: "ins", s: b }];
  if (!b) return [{ t: "del", s: a }];
  if (a === b) return [{ t: "eq", s: a }];

  const A = Array.from(a);
  const B = Array.from(b);
  const n = A.length;
  const m = B.length;

  // LCS DP(n*m)-章节纠错对照一般可接受;用于"标记修改"预览,不影响保存逻辑
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  const push = (t: DiffSeg["t"], s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("eq", A[i]);
      i++;
      j++;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", A[i]);
      i++;
    } else {
      push("ins", B[j]);
      j++;
    }
  }
  while (i < n) {
    push("del", A[i]);
    i++;
  }
  while (j < m) {
    push("ins", B[j]);
    j++;
  }

  // 仅展示"纠错后的文本"时,删除段无处显示;这里保留 del 以便未来扩展,但 UI 只高亮 ins
  return out;
}

export function toPrettyJsonLines(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t.split("\n") : [];
  }
  try {
    const s = JSON.stringify(v, null, 2);
    if (!s) return [];
    return s.split("\n");
  } catch {
    try {
      return [String(v)];
    } catch {
      return [];
    }
  }
}

function stateKeyLabel(k: string): string {
  const key = String(k || "").trim();
  if (!key) return "";
  if (key === "location") return "地点";
  if (key === "injuries") return "伤势与状态";
  if (key === "items") return "随身物品";
  if (key === "moneyChange") return "金钱变动";
  if (key === "money") return "金钱";
  if (key === "goal") return "目标";
  return key;
}

export function toStateFieldLines(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];

  const out: string[] = [];
  const pushKV = (k: string, v: unknown) => {
    const label = stateKeyLabel(k);
    if (!label) return;
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return;
      out.push(`${label}:${t}`);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      out.push(`${label}:${String(v)}`);
      return;
    }
    if (Array.isArray(v)) {
      const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (!items.length) return;
      out.push(`${label}:${items.join("、")}`);
      return;
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>)
        .map(([kk, vv]) => [String(kk).trim(), vv] as const)
        .filter(([kk]) => kk);
      if (!entries.length) return;
      for (const [kk, vv] of entries) {
        const childLabel = `${label}.${kk}`;
        if (vv === null || vv === undefined) continue;
        const s = typeof vv === "string" ? vv.trim() : Array.isArray(vv) ? vv.map(String).join("、") : String(vv);
        if (!String(s).trim()) continue;
        out.push(`${childLabel}:${s}`);
      }
    }
  };

  const keys = Object.keys(state as Record<string, unknown>).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  for (const k of keys) pushKV(k, (state as Record<string, unknown>)[k]);
  return out;
}

export function buildAuditTargets(input: {
  auditCharactersIndex: unknown;
  auditPlacesIndex: unknown;
  auditOrgsIndex: unknown;
  timelineIndex: unknown;
  storyFiles: StoryFile[];
}): AuditLinkTarget[] {
  const out: AuditLinkTarget[] = [];
  const push = (t: AuditLinkTarget) => {
    if (!t.id || !t.display) return;
    out.push(t);
  };

  const charsIndex = input.auditCharactersIndex as { characters?: unknown[]; hiddenNames?: unknown[] } | null;
  const chars = Array.isArray(charsIndex?.characters) ? charsIndex.characters : [];
  const hiddenChars = new Set(
    Array.isArray(charsIndex?.hiddenNames) ? charsIndex.hiddenNames.map(String) : []
  );
  for (const c of chars) {
    const row = c as Record<string, unknown>;
    const name = String(row?.name || "").trim();
    if (!name || hiddenChars.has(name)) continue;
    const role = String(row?.role || "").trim();
    const tags = Array.isArray(row?.tags) ? row.tags.map(String).filter(Boolean) : [];
    const personality = String(row?.personalityAnalysis || "").trim();
    const lines: string[] = [];
    lines.push(`姓名:${name}`);
    if (role) lines.push(`身份:${role}`);
    if (tags.length) lines.push(`标签:${tags.join("、")}`);
    if (personality) lines.push(`性格分析:${personality}`);
    const stateFields = toStateFieldLines(row?.state);
    for (const l of stateFields) lines.push(l);
    const compact = lines.map((s) => String(s)).filter((s) => s.trim().length > 0);
    push({
      kind: "character",
      id: name,
      display: name,
      summaryLines: compact.length ? compact : ["角色卡(未补充更多信息)"],
      jump: { tab: "auditCharacters", key: name }
    });
  }

  const placesIndex = input.auditPlacesIndex as { places?: unknown[]; hiddenNames?: unknown[] } | null;
  const places = Array.isArray(placesIndex?.places) ? placesIndex.places : [];
  const hiddenPlaces = new Set(
    Array.isArray(placesIndex?.hiddenNames) ? placesIndex.hiddenNames.map(String) : []
  );
  for (const p of places) {
    const row = p as Record<string, unknown>;
    const name = String(row?.name || "").trim();
    if (!name || hiddenPlaces.has(name)) continue;
    const desc = String(row?.description || "").trim();
    const note = String(row?.lastNote || "").trim();
    const last = row?.lastChapter ? `最近:第 ${row.lastChapter} 章` : "";
    push({
      kind: "place",
      id: name,
      display: name,
      summaryLines: [desc ? `简述:${desc}` : "", note ? `发生:${note}` : "", last].filter(Boolean).slice(0, 6),
      jump: { tab: "places", key: name }
    });
  }

  const timeline = input.timelineIndex as { events?: unknown[] } | null;
  const events = Array.isArray(timeline?.events) ? timeline.events : [];
  for (const e of events) {
    const row = e as Record<string, unknown>;
    const id = String(row?.id || "").trim();
    const title = String(row?.title || "").trim();
    if (!id || !title) continue;
    const sum = String(row?.summary || "").trim();
    push({
      kind: "timelineEvent",
      id,
      display: title,
      summaryLines: [
        sum ? `摘要:${sum}` : "",
        row?.startChapter ? `范围:第 ${row.startChapter}${row.endChapter && row.endChapter !== row.startChapter ? `-${row.endChapter}` : ""} 章` : ""
      ].filter(Boolean),
      jump: { tab: "timeline", key: id }
    });
  }

  for (const f of input.storyFiles || []) {
    if (!f?.title || !f?.path) continue;
    push({
      kind: "storyFile",
      id: String(f.path),
      display: String(f.title),
      summaryLines: [`资料:${f.title}`],
      jump: { tab: "story", key: String(f.path) }
    });
  }

  const orgsIndex = input.auditOrgsIndex as { orgs?: unknown[]; hiddenNames?: unknown[] } | null;
  const orgs = Array.isArray(orgsIndex?.orgs) ? orgsIndex.orgs : [];
  const hiddenOrgs = new Set(Array.isArray(orgsIndex?.hiddenNames) ? orgsIndex.hiddenNames.map(String) : []);
  for (const o of orgs) {
    const row = o as Record<string, unknown>;
    const name = String(row?.name || "").trim();
    if (!name || hiddenOrgs.has(name)) continue;
    const desc = String(row?.description || "").trim();
    const note = String(row?.lastNote || "").trim();
    const last = row?.lastChapter ? `最近:第 ${row.lastChapter} 章` : "";
    push({
      kind: "org",
      id: name,
      display: name,
      summaryLines: [desc ? `简述:${desc}` : "", note ? `动态:${note}` : "", last].filter(Boolean).slice(0, 6),
      jump: { tab: "orgs", key: name }
    });
  }
  return out;
}

export function auditCharStateExtraRows(st: Record<string, unknown>): Array<[string, string]> {
  const skip = new Set(["location", "injuries", "items", "moneyChange"]);
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(st)) {
    if (skip.has(k)) continue;
    const val = formatAuditCharField(v);
    if (!val) continue;
    rows.push([friendlyAuditFieldKey(k), val]);
  }
  return rows;
}

export function auditCharTopExtraRows(c: Record<string, unknown>): Array<[string, string]> {
  const skip = new Set([
    "name",
    "role",
    "tags",
    "newOrExisting",
    "state",
    "evidenceQuotes",
    "updatedAt",
    "socialTags",
    "historicalDebts",
    "occurredNotes",
    "narrativeDrives",
    "fingerprints",
    "relationalHooks",
    "personalityAnalysis"
  ]);
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(c)) {
    if (skip.has(k)) continue;
    const val = formatAuditCharField(v);
    if (!val) continue;
    rows.push([friendlyAuditFieldKey(k), val]);
  }
  return rows;
}
