import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChapterMeta,
  BookMeta,
  StoryFile,
  createChapter,
  createBook,
  createCharacter,
  listChapters,
  listBooks,
  listStory,
  readChapter,
  readStoryFile,
  renameChapter,
  updateChapter,
  updateStoryFile,
  patchBookSynopsis,
  deleteBook,
  restoreBook,
  putModelConfigs,
  auditChapter,
  getAuditLatest,
  getAuditLedger,
  getAuditCharacters,
  hideAuditCharacter,
  updateAuditCharacter,
  getAuditPlaces,
  hideAuditPlace,
  updateAuditPlace,
  getAuditOrgs,
  hideAuditOrg,
  updateAuditOrg,
  getTimelineIndex,
  compressTimelineRange,
  markTimelineEvent,
  TimelineIndex
} from "./api";

type SelectedChapter = { bookSlug: string; filename: string } | null;
type SelectedCard = { bookSlug: string; path: string } | null;

type MobilePresetId =
  | "iphone-se"
  | "iphone-14"
  | "iphone-14-pro-max"
  | "pixel-7"
  | "galaxy-s21"
  | "ipad-mini";

const MOBILE_PRESETS: Array<{ id: MobilePresetId; label: string; w: number; h: number }> = [
  { id: "iphone-se", label: "iPhone SE (375×667)", w: 375, h: 667 },
  { id: "iphone-14", label: "iPhone 14 (390×844)", w: 390, h: 844 },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
  { id: "pixel-7", label: "Pixel 7 (412×915)", w: 412, h: 915 },
  { id: "galaxy-s21", label: "Galaxy S21 (360×800)", w: 360, h: 800 },
  { id: "ipad-mini", label: "iPad mini (768×1024)", w: 768, h: 1024 }
];

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "novel-helper-theme";
const NAV_COLLAPSED_STORAGE_KEY = "novel-helper-nav-collapsed";
const MODEL_CONFIGS_STORAGE_KEY = "novel-helper-model-configs";
const MODEL_ACTIVE_ID_STORAGE_KEY = "novel-helper-model-active-id";

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "白天" },
  { id: "dark", label: "黑夜" }
];

const CHARACTER_ROLE_OPTIONS = ["主角", "配角", "反派", "盟友", "路人", "其他"] as const;
type CharacterRole = (typeof CHARACTER_ROLE_OPTIONS)[number];

function auditCharacterRoleClass(role: string): string {
  switch (role) {
    case "主角":
      return "auditCharRole auditCharRoleProtagonist";
    case "反派":
      return "auditCharRole auditCharRoleVillain";
    case "盟友":
      return "auditCharRole auditCharRoleAlly";
    case "配角":
      return "auditCharRole auditCharRoleSupporting";
    case "路人":
      return "auditCharRole auditCharRoleExtra";
    default:
      return "auditCharRole auditCharRoleOther";
  }
}

function auditCharacterNewBadgeClass(v: string): string {
  const t = (v || "").toLowerCase();
  if (t === "new") return "auditCharMeta auditCharMetaNew";
  if (t === "existing") return "auditCharMeta auditCharMetaExisting";
  return "auditCharMeta auditCharMetaUnknown";
}

function formatAuditCharField(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatAuditCharField(x)).filter(Boolean);
    return parts.join("；");
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function friendlyAuditFieldKey(k: string): string {
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

type AuditLinkKind = "character" | "place" | "org" | "timelineEvent" | "storyFile";
type AuditLinkTarget = {
  kind: AuditLinkKind;
  id: string;
  display: string;
  summaryLines: string[];
  jump: { tab: "chapterSummary" | "auditCharacters" | "places" | "orgs" | "timeline" | "story"; key: string };
};

function splitParagraphs(raw: string): string[] {
  const t = (raw || "").replace(/\r/g, "").trim();
  if (!t) return [];
  return t
    .split(/\n{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

type DiffSeg = { t: "eq" | "ins" | "del"; s: string };

function diffChars(aRaw: string, bRaw: string): DiffSeg[] {
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

  // LCS DP（n*m）—章节润色一般可接受；用于“标记修改”预览，不影响保存逻辑
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

  // 仅展示“润色后的文本”时，删除段无处显示；这里保留 del 以便未来扩展，但 UI 只高亮 ins
  return out;
}

function toPrettyJsonLines(v: any): string[] {
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

function toStateFieldLines(state: any): string[] {
  if (!state || typeof state !== "object") return [];

  const out: string[] = [];
  const pushKV = (k: string, v: any) => {
    const label = stateKeyLabel(k);
    if (!label) return;
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return;
      out.push(`${label}：${t}`);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      out.push(`${label}：${String(v)}`);
      return;
    }
    if (Array.isArray(v)) {
      const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (!items.length) return;
      out.push(`${label}：${items.join("、")}`);
      return;
    }
    if (typeof v === "object") {
      // 扁平化一层：用 “父字段.子字段” 形式，避免 JSON 花括号
      const entries = Object.entries(v as Record<string, any>)
        .map(([kk, vv]) => [String(kk).trim(), vv] as const)
        .filter(([kk]) => kk);
      if (!entries.length) return;
      for (const [kk, vv] of entries) {
        const childLabel = `${label}.${kk}`;
        if (vv === null || vv === undefined) continue;
        const s = typeof vv === "string" ? vv.trim() : Array.isArray(vv) ? vv.map(String).join("、") : String(vv);
        if (!String(s).trim()) continue;
        out.push(`${childLabel}：${s}`);
      }
    }
  };

  const keys = Object.keys(state as Record<string, any>).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  for (const k of keys) pushKV(k, (state as any)[k]);
  return out;
}

function buildAuditTargets(input: {
  auditCharactersIndex: any;
  auditPlacesIndex: any;
  auditOrgsIndex: any;
  timelineIndex: any;
  storyFiles: StoryFile[];
}): AuditLinkTarget[] {
  const out: AuditLinkTarget[] = [];
  const push = (t: AuditLinkTarget) => {
    if (!t.id || !t.display) return;
    out.push(t);
  };

  const chars = Array.isArray(input.auditCharactersIndex?.characters) ? input.auditCharactersIndex.characters : [];
  const hiddenChars = new Set(
    Array.isArray(input.auditCharactersIndex?.hiddenNames) ? input.auditCharactersIndex.hiddenNames.map(String) : []
  );
  for (const c of chars) {
    const name = String(c?.name || "").trim();
    if (!name || hiddenChars.has(name)) continue;
    const role = String(c?.role || "").trim();
    const tags = Array.isArray(c?.tags) ? c.tags.map(String).filter(Boolean) : [];
    const personality = String(c?.personalityAnalysis || "").trim();
    const lines: string[] = [];
    lines.push(`姓名：${name}`);
    if (role) lines.push(`身份：${role}`);
    if (tags.length) lines.push(`标签：${tags.join("、")}`);
    if (personality) lines.push(`性格分析：${personality}`);
    const stateFields = toStateFieldLines(c?.state);
    for (const l of stateFields) lines.push(l);
    const compact = lines.map((s) => String(s)).filter((s) => s.trim().length > 0);
    push({
      kind: "character",
      id: name,
      display: name,
      summaryLines: compact.length ? compact : ["角色卡（未补充更多信息）"],
      jump: { tab: "auditCharacters", key: name }
    });
  }

  const places = Array.isArray(input.auditPlacesIndex?.places) ? input.auditPlacesIndex.places : [];
  const hiddenPlaces = new Set(
    Array.isArray(input.auditPlacesIndex?.hiddenNames) ? input.auditPlacesIndex.hiddenNames.map(String) : []
  );
  for (const p of places) {
    const name = String(p?.name || "").trim();
    if (!name || hiddenPlaces.has(name)) continue;
    const desc = String(p?.description || "").trim();
    const note = String(p?.lastNote || "").trim();
    const last = p?.lastChapter ? `最近：第 ${p.lastChapter} 章` : "";
    push({
      kind: "place",
      id: name,
      display: name,
      summaryLines: [desc ? `简述：${desc}` : "", note ? `发生：${note}` : "", last].filter(Boolean).slice(0, 6),
      jump: { tab: "places", key: name }
    });
  }

  const events = Array.isArray(input.timelineIndex?.events) ? input.timelineIndex.events : [];
  for (const e of events) {
    const id = String(e?.id || "").trim();
    const title = String(e?.title || "").trim();
    if (!id || !title) continue;
    const sum = String(e?.summary || "").trim();
    push({
      kind: "timelineEvent",
      id,
      display: title,
      summaryLines: [sum ? `摘要：${sum}` : "", e?.startChapter ? `范围：第 ${e.startChapter}${e.endChapter && e.endChapter !== e.startChapter ? `-${e.endChapter}` : ""} 章` : ""].filter(Boolean),
      jump: { tab: "timeline", key: id }
    });
  }

  for (const f of input.storyFiles || []) {
    if (!f?.title || !f?.path) continue;
    push({
      kind: "storyFile",
      id: String(f.path),
      display: String(f.title),
      summaryLines: [`资料：${f.title}`],
      jump: { tab: "story", key: String(f.path) }
    });
  }

  // 组织：暂用 story/characters 之外没有正式索引；后续在 server-orgs-index-optional 中补齐
  const orgs = Array.isArray(input.auditOrgsIndex?.orgs) ? input.auditOrgsIndex.orgs : [];
  const hiddenOrgs = new Set(
    Array.isArray(input.auditOrgsIndex?.hiddenNames) ? input.auditOrgsIndex.hiddenNames.map(String) : []
  );
  for (const o of orgs) {
    const name = String(o?.name || "").trim();
    if (!name || hiddenOrgs.has(name)) continue;
    const desc = String(o?.description || "").trim();
    const note = String(o?.lastNote || "").trim();
    const last = o?.lastChapter ? `最近：第 ${o.lastChapter} 章` : "";
    push({
      kind: "org",
      id: name,
      display: name,
      summaryLines: [desc ? `简述：${desc}` : "", note ? `动态：${note}` : "", last].filter(Boolean).slice(0, 6),
      jump: { tab: "orgs", key: name }
    });
  }
  return out;
}

function auditCharStateExtraRows(st: Record<string, unknown>): Array<[string, string]> {
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

function auditCharTopExtraRows(c: Record<string, unknown>): Array<[string, string]> {
  const skip = new Set(["name", "role", "tags", "newOrExisting", "state", "evidenceQuotes"]);
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(c)) {
    if (skip.has(k)) continue;
    const val = formatAuditCharField(v);
    if (!val) continue;
    rows.push([friendlyAuditFieldKey(k), val]);
  }
  return rows;
}

const CHARACTER_TAG_OPTIONS = ["盟友", "敌对", "家人", "同事", "组织", "阵营"] as const;

type ModelProviderId = "openai" | "deepseek" | "gemini" | "qwen" | "ollama" | "custom";

type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProviderId;
  baseUrl: string;
  apiKey: string;
  testUrl: string;
  model?: string;
  extraHeadersJson?: string;
  /** 最近一次测试是否通过（仅用于 UI 展示） */
  lastTestOk?: boolean;
  /** 仅部分 provider 可提供：最近一次测试拿到的模型列表（如 Ollama /api/tags） */
  lastModels?: string[];
};

const BUILTIN_MODEL_PROVIDERS: Array<{ id: ModelProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "千问（通义千问）" },
  { id: "ollama", label: "Ollama（本地）" },
  { id: "custom", label: "自定义服务" }
];

function defaultConfigFor(provider: ModelProviderId): ModelConfig {
  const id = `${provider}-${Date.now()}`;
  if (provider === "openai")
    return {
      id,
      label: "OpenAI",
      provider,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      testUrl: "https://api.openai.com/v1/models",
      model: "gpt-4.1-mini"
    };
  if (provider === "deepseek")
    return {
      id,
      label: "DeepSeek",
      provider,
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      testUrl: "https://api.deepseek.com/v1/models",
      model: "deepseek-chat"
    };
  if (provider === "gemini")
    return {
      id,
      label: "Gemini",
      provider,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "",
      testUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      model: "gemini-1.5-flash"
    };
  if (provider === "qwen")
    return {
      id,
      label: "千问",
      provider,
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      apiKey: "",
      testUrl: "https://dashscope.aliyuncs.com/api/v1/models",
      model: "qwen-plus"
    };
  if (provider === "ollama")
    return {
      id,
      label: "Ollama（本地）",
      provider,
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "",
      testUrl: "http://127.0.0.1:11434/api/tags",
      model: ""
    };
  return {
    id,
    label: "自定义",
    provider: "custom",
    baseUrl: "",
    apiKey: "",
    testUrl: "",
    model: "",
    extraHeadersJson: "{}"
  };
}

function loadModelConfigs(): { configs: ModelConfig[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(MODEL_CONFIGS_STORAGE_KEY);
    const activeId = localStorage.getItem(MODEL_ACTIVE_ID_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ModelConfig[]) : [];
    const byProvider = new Map<ModelProviderId, ModelConfig>();
    if (Array.isArray(parsed)) {
      for (const c of parsed) {
        if (!c?.provider) continue;
        if (!byProvider.has(c.provider)) byProvider.set(c.provider, c);
      }
    }
    const configs = BUILTIN_MODEL_PROVIDERS.map((p) => byProvider.get(p.id) ?? defaultConfigFor(p.id));
    return { configs, activeId: activeId || configs[0]?.id || null };
  } catch {
    const configs = BUILTIN_MODEL_PROVIDERS.map((p) => defaultConfigFor(p.id));
    return { configs, activeId: configs[0]?.id || null };
  }
}

function migrateLegacyTheme(raw: string | null): ThemePreference {
  if (raw === "system" || raw === "light" || raw === "dark") return raw;
  if (!raw) return "system";
  const darkLegacy = new Set(["default", "midnight", "forest", "sunset", "ocean", "loam"]);
  const lightLegacy = new Set(["paper", "sepia", "village", "meadow", "clay"]);
  if (darkLegacy.has(raw)) return "dark";
  if (lightLegacy.has(raw)) return "light";
  return "system";
}

function loadThemePreference(): ThemePreference {
  try {
    return migrateLegacyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** 停止输入约多久后写入磁盘（毫秒） */
const AUTOSAVE_DEBOUNCE_MS = 900;

/** 允许在线改标题的文件名：`序号_任意标题.md` */
const CHAPTER_TITLE_RENAME_FILE_RE = /^(\d+)_.+\.md$/;

/** 与服务端一致的近似字数（列表与编辑器共用） */
function approximateWordCount(s: string): number {
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return zh + en;
}

function normalizeChapterGapList(raw: number[]): number[] {
  return [...new Set(raw)].filter((n) => Number.isFinite(n) && n >= 1).sort((a, b) => a - b);
}

/** 展示用：「第 4 章、第 7 章」 */
function formatMissingChapterList(gaps: number[]): string {
  return normalizeChapterGapList(gaps)
    .map((n) => `第 ${n} 章`)
    .join("、");
}

function formatBookCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** 左侧栏展开/收起（收起时令图标水平镜像） */
function SidebarToggleIcon({ mirrored }: { mirrored: boolean }) {
  return (
    <svg
      className={`sidebarToggleSvg ${mirrored ? "sidebarToggleSvgMirrored" : ""}`}
      viewBox="0 0 1024 1024"
      width={20}
      height={20}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M109.632 673.664h519.68c25.152 0 45.568-22.016 45.568-48.896 0-26.88-20.416-48.896-45.568-48.896h-519.68c-25.216 0-45.632 22.016-45.632 48.896 0 26.88 20.48 48.896 45.632 48.896z m0-228.096h519.68c25.152 0 45.568-21.952 45.568-48.896 0-26.88-20.416-48.896-45.568-48.896h-519.68c-25.216 0-45.632 22.016-45.632 48.896 0 26.88 20.48 48.896 45.632 48.896z m3.264-219.904h795.776c26.88 0 50.56-20.352 51.328-47.168A48.896 48.896 0 0 0 911.104 128H115.328c-26.88 0-50.56 20.416-51.328 47.168a48.896 48.896 0 0 0 48.896 50.56z m619.776 447.232V348.672L960 510.784l-227.328 162.112c0 0.768 0 0.768 0 0z m178.432 122.944H115.328c-26.88 0-50.56 20.48-51.328 47.232a48.896 48.896 0 0 0 48.896 50.496h795.776c26.88 0 50.56-20.416 51.328-47.232a48.896 48.896 0 0 0-48.896-50.496z"
      />
    </svg>
  );
}

function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

async function toggleDocumentFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  if (getFullscreenElement()) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (doc.webkitExitFullscreen) await Promise.resolve(doc.webkitExitFullscreen());
    else if (doc.mozCancelFullScreen) await Promise.resolve(doc.mozCancelFullScreen());
    else if (doc.msExitFullscreen) await Promise.resolve(doc.msExitFullscreen());
    return;
  }

  if (root.requestFullscreen) await root.requestFullscreen();
  else if (root.webkitRequestFullscreen) await Promise.resolve(root.webkitRequestFullscreen());
  else if (root.mozRequestFullScreen) await Promise.resolve(root.mozRequestFullScreen());
  else if (root.msRequestFullscreen) await Promise.resolve(root.msRequestFullscreen());
}

/** 进入全屏（四角外扩） */
function IconFullscreenEnter(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/** 退出全屏（四角内收） */
function IconFullscreenExit(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="10" y1="14" x2="3" y2="21" />
    </svg>
  );
}

export function App() {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [activeBook, setActiveBook] = useState<string>("");
  /** true：左侧显示书架；false：左侧显示当前书的章节 */
  const [navHome, setNavHome] = useState(true);
  /** false：与服务端一致（书按创建时间升序、章节按序号升序）；true：倒序展示 */
  const [bookShelfSortDesc, setBookShelfSortDesc] = useState(false);
  const [chapterSortDesc, setChapterSortDesc] = useState(false);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<SelectedChapter>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);

  const [createBookModalOpen, setCreateBookModalOpen] = useState(false);
  const [chapterGapModalOpen, setChapterGapModalOpen] = useState(false);
  const [chapterGapModalBookSlug, setChapterGapModalBookSlug] = useState("");
  const [chapterGapModalIndexes, setChapterGapModalIndexes] = useState<number[]>([]);
  const [chapterGapModalDraftTitle, setChapterGapModalDraftTitle] = useState("");
  const [modalNewTitle, setModalNewTitle] = useState("");
  const [modalNewSynopsis, setModalNewSynopsis] = useState("");
  const [deleteBookModalOpen, setDeleteBookModalOpen] = useState(false);
  const [deleteBookTarget, setDeleteBookTarget] = useState<BookMeta | null>(null);
  const [shelfPeekSlug, setShelfPeekSlug] = useState<string | null>(null);
  const [shelfPeekDraft, setShelfPeekDraft] = useState("");
  const [shelfPeekSaving, setShelfPeekSaving] = useState(false);

  const [chapterTitle, setChapterTitle] = useState("");
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false);
  const [modalCharacterName, setModalCharacterName] = useState("");
  const [modalCharacterRole, setModalCharacterRole] = useState<CharacterRole>("配角");
  const [modalCharacterTags, setModalCharacterTags] = useState<string[]>([]);
  const [modalCharacterTagDraft, setModalCharacterTagDraft] = useState("");

  const [chapterContent, setChapterContent] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [storyFiles, setStoryFiles] = useState<StoryFile[]>([]);
  const [rightTab, setRightTab] = useState<
    "chapterSummary" | "auditCharacters" | "story" | "places" | "orgs" | "timeline"
  >("chapterSummary");
  const [expandedAuditCharIds, setExpandedAuditCharIds] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [mobileReading, setMobileReading] = useState(false);
  const [auditReadModeOn, setAuditReadModeOn] = useState(false);
  const [polishModeOn, setPolishModeOn] = useState(false);
  const [expandModeOn, setExpandModeOn] = useState(false);
  const [mobilePreset, setMobilePreset] = useState<MobilePresetId>("iphone-14");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => loadThemePreference());
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [{ configs: modelConfigs, activeId: activeModelId }, setModelState] = useState(() =>
    loadModelConfigs()
  );
  const [modelConfigEditorId, setModelConfigEditorId] = useState<string | null>(null);
  const [modelEditorDraft, setModelEditorDraft] = useState<ModelConfig | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<string>("");
  const [homeCenterTab, setHomeCenterTab] = useState<"welcome" | "model">("welcome");
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [chapterAutosaveHint, setChapterAutosaveHint] = useState("");
  const [cardAutosaveHint, setCardAutosaveHint] = useState("");
  const [synopsisDraft, setSynopsisDraft] = useState("");
  const [bookOverviewAutosaveHint, setBookOverviewAutosaveHint] = useState("");
  const [chapterRenameDraft, setChapterRenameDraft] = useState("");
  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);

  const chapterTitleInputRef = useRef<HTMLInputElement>(null);
  const chapterGapTitleInputRef = useRef<HTMLInputElement>(null);
  const createBookTitleInputRef = useRef<HTMLInputElement>(null);
  const chapterTitleSkipBlurRef = useRef(false);

  const selectedChapterRef = useRef<SelectedChapter>(null);
  const chapterTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chapterContentRef = useRef("");
  const chapterBaselineRef = useRef("");
  const chapterTimerRef = useRef<number | null>(null);

  const selectedCardRef = useRef<SelectedCard>(null);
  const cardContentRef = useRef("");
  const cardBaselineRef = useRef("");
  const cardTimerRef = useRef<number | null>(null);

  const flushChapterSaveRef = useRef<() => Promise<void>>(async () => {});
  const flushCardSaveRef = useRef<() => Promise<void>>(async () => {});
  const flushSynopsisSaveRef = useRef<() => Promise<void>>(async () => {});

  const activeBookRef = useRef("");
  const synopsisBaselineRef = useRef("");
  const synopsisDraftRef = useRef("");
  const synopsisTimerRef = useRef<number | null>(null);
  const prevBookSlugRef = useRef("");

  selectedChapterRef.current = selectedChapter;
  function scrollChapterToTop() {
    const el = chapterTextareaRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }

  chapterContentRef.current = chapterContent;
  selectedCardRef.current = selectedCard;
  cardContentRef.current = cardContent;
  activeBookRef.current = activeBook;
  synopsisDraftRef.current = synopsisDraft;

  const selectedChapterMeta = useMemo(() => {
    if (!selectedChapter) return null;
    return chapters.find((c) => c.filename === selectedChapter.filename) || null;
  }, [chapters, selectedChapter]);

  const activeBookMeta = useMemo(() => books.find((b) => b.slug === activeBook) ?? null, [books, activeBook]);

  const sortedActiveMissingChapterIndexes = useMemo(
    () => normalizeChapterGapList(activeBookMeta?.missingChapterIndexes ?? []),
    [activeBookMeta?.missingChapterIndexes]
  );

  const displayedBooks = useMemo(() => {
    if (!bookShelfSortDesc) return books;
    return [...books].reverse();
  }, [books, bookShelfSortDesc]);

  const displayedChapters = useMemo(() => {
    if (!chapterSortDesc) return chapters;
    return [...chapters].reverse();
  }, [chapters, chapterSortDesc]);

  const adjacentChapters = useMemo(() => {
    const filename = selectedChapter?.filename;
    if (!filename) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    const i = displayedChapters.findIndex((c) => c.filename === filename);
    if (i < 0) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    return {
      prev: i > 0 ? displayedChapters[i - 1] : null,
      next: i + 1 < displayedChapters.length ? displayedChapters[i + 1] : null
    };
  }, [displayedChapters, selectedChapter?.filename]);

  const canRenameChapterFilename = useMemo(() => {
    if (!selectedChapter?.filename) return false;
    return CHAPTER_TITLE_RENAME_FILE_RE.test(selectedChapter.filename);
  }, [selectedChapter?.filename]);

  const chapterWordCount = useMemo(() => approximateWordCount(chapterContent || ""), [chapterContent]);

  const mobileViewport = useMemo(() => {
    const preset = MOBILE_PRESETS.find((p) => p.id === mobilePreset) || MOBILE_PRESETS[1];
    return { w: preset.w, h: preset.h, label: preset.label };
  }, [mobilePreset]);

  const showBookOverview = Boolean(activeBook && !selectedChapter);

  function clearChapterTimer() {
    if (chapterTimerRef.current !== null) {
      window.clearTimeout(chapterTimerRef.current);
      chapterTimerRef.current = null;
    }
  }

  function clearCardTimer() {
    if (cardTimerRef.current !== null) {
      window.clearTimeout(cardTimerRef.current);
      cardTimerRef.current = null;
    }
  }

  function clearSynopsisTimer() {
    if (synopsisTimerRef.current !== null) {
      window.clearTimeout(synopsisTimerRef.current);
      synopsisTimerRef.current = null;
    }
  }

  async function persistChapterNow(): Promise<boolean> {
    const sel = selectedChapterRef.current;
    const content = chapterContentRef.current;
    const baseline = chapterBaselineRef.current;
    if (!sel || content === baseline) return true;
    setChapterAutosaveHint("保存中");
    try {
      await updateChapter(sel.bookSlug, sel.filename, content);
      chapterBaselineRef.current = content;
      const w = approximateWordCount(content);
      setChapters((prev) => prev.map((c) => (c.filename === sel.filename ? { ...c, wordCount: w } : c)));
      setChapterAutosaveHint("已保存");
      window.setTimeout(() => {
        setChapterAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setChapterAutosaveHint("保存失败");
      setStatus(msg);
      return false;
    }
  }

  async function flushChapterSave() {
    clearChapterTimer();
    await persistChapterNow();
  }

  async function persistCardNow(): Promise<boolean> {
    const sel = selectedCardRef.current;
    const content = cardContentRef.current;
    const baseline = cardBaselineRef.current;
    if (!sel || content === baseline) return true;
    setCardAutosaveHint("保存中");
    try {
      await updateStoryFile(sel.bookSlug, sel.path, content);
      cardBaselineRef.current = content;
      setCardAutosaveHint("已保存");
      window.setTimeout(() => {
        setCardAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setCardAutosaveHint("保存失败");
      setStatus(msg);
      return false;
    }
  }

  async function flushCardSave() {
    clearCardTimer();
    await persistCardNow();
  }

  async function persistSynopsisNow(): Promise<void> {
    const slug = activeBookRef.current;
    const draft = synopsisDraftRef.current;
    const baseline = synopsisBaselineRef.current;
    if (!slug || selectedChapterRef.current !== null) return;
    if (draft === baseline) return;
    setBookOverviewAutosaveHint("保存中");
    try {
      const { book } = await patchBookSynopsis(slug, draft);
      synopsisBaselineRef.current = draft;
      setBooks((prev) => prev.map((b) => (b.slug === slug ? book : b)));
      setBookOverviewAutosaveHint("已保存");
      window.setTimeout(() => {
        setBookOverviewAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
    } catch (e: any) {
      setBookOverviewAutosaveHint("保存失败");
      setStatus(e?.message || String(e));
    }
  }

  async function flushSynopsisSave() {
    clearSynopsisTimer();
    await persistSynopsisNow();
  }

  flushChapterSaveRef.current = flushChapterSave;
  flushCardSaveRef.current = flushCardSave;
  flushSynopsisSaveRef.current = flushSynopsisSave;

  async function refreshBooks() {
    const { books } = await listBooks();
    setBooks(books);
  }

  async function refreshChapters(bookSlug: string) {
    const { chapters } = await listChapters(bookSlug);
    setChapters(chapters);
  }

  async function refreshStory(bookSlug: string) {
    const { storyFiles } = await listStory(bookSlug);
    setStoryFiles(storyFiles);
  }

  useEffect(() => {
    refreshBooks().catch((e) => setStatus(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shelfPeekSlug) {
      setShelfPeekDraft("");
      return;
    }
    const m = books.find((b) => b.slug === shelfPeekSlug);
    setShelfPeekDraft(m?.synopsis ?? "");
    // 仅在切换展开的书籍时对齐服务端简介；不在 books 刷新时重置，避免覆盖正在输入的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfPeekSlug]);

  useEffect(() => {
    if (!activeBook) {
      setTimelineIndex(null);
      return;
    }
    void refreshTimelineIndex(activeBook);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBook]);

  useEffect(() => {
    if (!createBookModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) setCreateBookModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createBookModalOpen, busy]);

  const closeChapterGapModal = useCallback(() => {
    setChapterGapModalOpen(false);
    setChapterGapModalBookSlug("");
    setChapterGapModalIndexes([]);
    setChapterGapModalDraftTitle("");
  }, []);

  useEffect(() => {
    if (!chapterGapModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) closeChapterGapModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapterGapModalOpen, busy, closeChapterGapModal]);

  useEffect(() => {
    if (!chapterGapModalOpen) return;
    queueMicrotask(() => chapterGapTitleInputRef.current?.focus());
  }, [chapterGapModalOpen]);

  useEffect(() => {
    if (!createBookModalOpen) return;
    queueMicrotask(() => createBookTitleInputRef.current?.focus());
  }, [createBookModalOpen]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-system", "theme-light", "theme-dark");
    root.classList.add(`theme-${themePreference}`);
  }, [themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // ignore
    }
  }, [themePreference]);

  useEffect(() => {
    const sync = () => setFullscreenOn(Boolean(getFullscreenElement()));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    document.addEventListener("mozfullscreenchange", sync);
    document.addEventListener("MSFullscreenChange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
      document.removeEventListener("mozfullscreenchange", sync);
      document.removeEventListener("MSFullscreenChange", sync);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, navCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [navCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(modelConfigs));
      if (activeModelId) localStorage.setItem(MODEL_ACTIVE_ID_STORAGE_KEY, activeModelId);
    } catch {
      // ignore
    }
  }, [modelConfigs, activeModelId]);

  useEffect(() => {
    // 同步到服务端供审计调用（失败不影响前端使用）
    void putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
  }, [modelConfigs, activeModelId]);

  const [auditRun, setAuditRun] = useState<any | null>(null);
  const [auditLedger, setAuditLedger] = useState<any | null>(null);
  const [auditCharactersIndex, setAuditCharactersIndex] = useState<any | null>(null);
  const [auditPlacesIndex, setAuditPlacesIndex] = useState<any | null>(null);
  const [auditOrgsIndex, setAuditOrgsIndex] = useState<any | null>(null);
  const [hiddenOrgPanelOpen, setHiddenOrgPanelOpen] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgDesc, setEditOrgDesc] = useState("");
  const [editOrgLastNote, setEditOrgLastNote] = useState("");
  const [hiddenPlacePanelOpen, setHiddenPlacePanelOpen] = useState(false);
  const [editPlaceOpen, setEditPlaceOpen] = useState(false);
  const [editPlaceName, setEditPlaceName] = useState("");
  const [editPlaceDesc, setEditPlaceDesc] = useState("");
  const [editPlaceLastNote, setEditPlaceLastNote] = useState("");
  const [placeGroupCollapsed, setPlaceGroupCollapsed] = useState<Record<string, boolean>>({});
  const [placeTextExpanded, setPlaceTextExpanded] = useState<Record<string, boolean>>({});
  const [hiddenCharPanelOpen, setHiddenCharPanelOpen] = useState(false);
  const [editCharOpen, setEditCharOpen] = useState(false);
  const [editCharName, setEditCharName] = useState("");
  const [editCharRole, setEditCharRole] = useState("");
  const [editCharTags, setEditCharTags] = useState("");
  const [editCharStateJson, setEditCharStateJson] = useState("");
  const [editCharPersonality, setEditCharPersonality] = useState("");
  const [timelineIndex, setTimelineIndex] = useState<TimelineIndex | null>(null);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineCompressStart, setTimelineCompressStart] = useState("");
  const [timelineCompressEnd, setTimelineCompressEnd] = useState("");
  const [timelineShowDoneEvents, setTimelineShowDoneEvents] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const okModelConfigs = useMemo(() => modelConfigs.filter((c) => c.lastTestOk), [modelConfigs]);
  const [auditModelPickerOpen, setAuditModelPickerOpen] = useState(false);
  const [auditModelSearch, setAuditModelSearch] = useState("");
  const [auditStreamOpen, setAuditStreamOpen] = useState(false);
  type AuditStreamPhase = "idle" | "running" | "done" | "error";
  const [auditStreamPhase, setAuditStreamPhase] = useState<AuditStreamPhase>("idle");
  const [auditStreamText, setAuditStreamText] = useState("");
  const auditStreamRef = useRef<HTMLDivElement | null>(null);
  const auditReaderRootRef = useRef<HTMLDivElement | null>(null);
  const [auditHover, setAuditHover] = useState<{
    target: AuditLinkTarget;
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  const [polishBusy, setPolishBusy] = useState(false);
  type PolishPhase = "idle" | "running" | "done" | "error";
  const [polishPhase, setPolishPhase] = useState<PolishPhase>("idle");
  const [polishOriginal, setPolishOriginal] = useState("");
  const [polishDraft, setPolishDraft] = useState("");

  const [expandModalOpen, setExpandModalOpen] = useState(false);
  const [expandTargetWords, setExpandTargetWords] = useState("");
  const [expandExtraContext, setExpandExtraContext] = useState("");
  const [expandBusy, setExpandBusy] = useState(false);
  const [expandDraft, setExpandDraft] = useState("");
  /** SSE 收到的完整思考缓冲（服务端可能一次推一大块）；界面用 RAF 逐段追上 */
  const auditThinkingBufferRef = useRef("");
  const auditDisplayedLenRef = useRef(0);
  const auditRevealRafRef = useRef<number | null>(null);

  const flushAuditThinkingReveal = useCallback(() => {
    auditRevealRafRef.current = null;
    const full = auditThinkingBufferRef.current;
    let len = auditDisplayedLenRef.current;
    if (len >= full.length) return;
    const backlog = full.length - len;
    const stride =
      backlog > 2500 ? 20 : backlog > 1000 ? 10 : backlog > 400 ? 4 : backlog > 150 ? 2 : 1;
    len = Math.min(len + stride, full.length);
    auditDisplayedLenRef.current = len;
    setAuditStreamText(full.slice(0, len));
    if (len < full.length) {
      auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
    }
  }, []);

  const appendAuditThinkingDelta = useCallback(
    (delta: string) => {
      const d = delta ?? "";
      if (!d) return;
      auditThinkingBufferRef.current += d;
      if (auditRevealRafRef.current == null) {
        auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
      }
    },
    [flushAuditThinkingReveal]
  );

  const resetAuditThinkingReveal = useCallback(() => {
    if (auditRevealRafRef.current != null) {
      cancelAnimationFrame(auditRevealRafRef.current);
      auditRevealRafRef.current = null;
    }
    auditThinkingBufferRef.current = "";
    auditDisplayedLenRef.current = 0;
    setAuditStreamText("");
  }, []);

  useEffect(() => {
    return () => {
      if (auditRevealRafRef.current != null) cancelAnimationFrame(auditRevealRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!auditStreamOpen) return;
    const el = auditStreamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [auditStreamText, auditStreamOpen]);

  useEffect(() => {
    // 只允许选择“连接成功”的配置；如果当前 active 不在成功列表，自动回落
    if (!okModelConfigs.length) return;
    if (activeModelId && okModelConfigs.some((c) => c.id === activeModelId)) return;
    setModelState((prev) => ({ ...prev, activeId: okModelConfigs[0].id }));
  }, [okModelConfigs, activeModelId]);

  const activeModelLabel = useMemo(() => {
    const c = okModelConfigs.find((x) => x.id === activeModelId) ?? okModelConfigs[0];
    if (!c) return "暂无可用模型";
    const name = (c.model ?? "").trim();
    return name ? `${c.label} · ${name}` : c.label;
  }, [okModelConfigs, activeModelId]);

  const okModelGroups = useMemo(() => {
    type Item =
      | { kind: "config"; id: string; configId: string; label: string }
      | { kind: "ollamaModel"; id: string; configId: string; label: string; modelName: string };

    const toItems = (c: ModelConfig): Item[] => {
      if (c.provider === "ollama" && Array.isArray(c.lastModels) && c.lastModels.length) {
        const uniq = [...new Set(c.lastModels.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200);
        uniq.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        return uniq.map((name) => ({
          kind: "ollamaModel",
          id: `${c.id}::${name}`,
          configId: c.id,
          label: name,
          modelName: name
        }));
      }
      const label = (c.model ?? "").trim() || c.label;
      return [{ kind: "config", id: c.id, configId: c.id, label }];
    };

    const byProvider = new Map<ModelProviderId, Item[]>();
    for (const c of okModelConfigs) {
      const arr = byProvider.get(c.provider) ?? [];
      arr.push(...toItems(c));
      byProvider.set(c.provider, arr);
    }
    const labelOf = (p: ModelProviderId) => BUILTIN_MODEL_PROVIDERS.find((x) => x.id === p)?.label ?? p;
    return BUILTIN_MODEL_PROVIDERS.map((p) => ({ id: p.id, label: labelOf(p.id), items: byProvider.get(p.id) ?? [] }));
  }, [okModelConfigs]);

  const okModelGroupsFiltered = useMemo(() => {
    const q = auditModelSearch.trim().toLowerCase();
    if (!q) return okModelGroups.filter((g) => g.items.length);
    return okModelGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it: any) => {
          const s = `${g.label} ${it.label} ${it.kind ?? ""}`.toLowerCase();
          return s.includes(q);
        })
      }))
      .filter((g) => g.items.length);
  }, [okModelGroups, auditModelSearch]);

  async function goModelConfigList() {
    try {
      await flushSynopsisSave();
      await flushChapterSave();
    } catch {
      // ignore
    }
    setAuditModelPickerOpen(false);
    setAuditModelSearch("");
    setNavHome(true);
    setHomeCenterTab("model");
    setActiveBook("");
    setSelectedChapter(null);
    setSelectedCard(null);
  }

  useEffect(() => {
    if (!activeBook) return;
    refreshChapters(activeBook).catch((e) => setStatus(String(e?.message || e)));
    refreshStory(activeBook).catch((e) => setStatus(String(e?.message || e)));
  }, [activeBook]);

  useEffect(() => {
    if (!activeBook) {
      prevBookSlugRef.current = "";
      return;
    }
    const m = books.find((b) => b.slug === activeBook);
    if (!m) return;
    if (prevBookSlugRef.current !== activeBook) {
      prevBookSlugRef.current = activeBook;
      const s = m.synopsis ?? "";
      setSynopsisDraft(s);
      synopsisBaselineRef.current = s;
    }
  }, [activeBook, books]);

  useEffect(() => {
    setChapterRenameDraft(selectedChapterMeta?.title ?? "");
  }, [selectedChapter?.filename, selectedChapterMeta?.title]);

  useEffect(() => {
    setChapterTitleEditing(false);
  }, [selectedChapter?.filename]);

  useEffect(() => {
    if (!selectedChapter) return;
    if (chapterContent === chapterBaselineRef.current) return;

    clearChapterTimer();
    chapterTimerRef.current = window.setTimeout(() => {
      chapterTimerRef.current = null;
      void persistChapterNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearChapterTimer();
  }, [chapterContent, selectedChapter]);

  useEffect(() => {
    if (!selectedCard) return;
    if (cardContent === cardBaselineRef.current) return;

    clearCardTimer();
    cardTimerRef.current = window.setTimeout(() => {
      cardTimerRef.current = null;
      void persistCardNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearCardTimer();
  }, [cardContent, selectedCard]);

  useEffect(() => {
    if (!activeBook || selectedChapter !== null) return;
    if (synopsisDraft === synopsisBaselineRef.current) return;
    clearSynopsisTimer();
    synopsisTimerRef.current = window.setTimeout(() => {
      synopsisTimerRef.current = null;
      void persistSynopsisNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearSynopsisTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistSynopsisNow 依赖 ref，避免重复挂载定时器
  }, [synopsisDraft, activeBook, selectedChapter]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      void flushChapterSaveRef.current();
      void flushCardSaveRef.current();
      void flushSynopsisSaveRef.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function goNavHome() {
    await flushChapterSave();
    await flushCardSave();
    await flushSynopsisSave();
    setNavHome(true);
    setHomeCenterTab("welcome");
    setActiveBook("");
    setSelectedChapter(null);
    setSelectedCard(null);
    setChapterContent("");
    setCardContent("");
    chapterBaselineRef.current = "";
    cardBaselineRef.current = "";
    setChapterAutosaveHint("");
    setCardAutosaveHint("");
    setChapterTitleEditing(false);
    await refreshBooks().catch((e: any) => setStatus(String(e?.message || e)));
  }

  async function openBookFromShelf(b: BookMeta) {
    await flushChapterSave();
    await flushCardSave();
    await flushSynopsisSave();
    setActiveBook(b.slug);
    setNavHome(false);
    setSelectedChapter(null);
    setSelectedCard(null);
    setChapterContent("");
    setCardContent("");
    chapterBaselineRef.current = "";
    cardBaselineRef.current = "";
    setChapterAutosaveHint("");
    setCardAutosaveHint("");
    setChapterTitleEditing(false);
  }

  function openCreateBookModal() {
    setModalNewTitle("");
    setModalNewSynopsis("");
    setCreateBookModalOpen(true);
  }

  async function submitCreateBookModal() {
    const t = modalNewTitle.trim();
    if (!t) return;
    setBusy(true);
    setStatus("");
    try {
      const syn = modalNewSynopsis.trim();
      const { book } = await createBook({ title: t, synopsis: syn || undefined });
      setCreateBookModalOpen(false);
      setModalNewTitle("");
      setModalNewSynopsis("");
      await refreshBooks();
      setActiveBook(book.slug);
      setNavHome(false);
      setShelfPeekSlug(null);
      setStatus(`已创建书籍：${book.title}`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveShelfPeekSynopsis(slug: string) {
    setShelfPeekSaving(true);
    setStatus("");
    try {
      const { book } = await patchBookSynopsis(slug, shelfPeekDraft.trim());
      setBooks((prev) => prev.map((b) => (b.slug === slug ? book : b)));
      setStatus("简介已保存。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setShelfPeekSaving(false);
    }
  }

  function openDeleteBookModal(b: BookMeta) {
    setDeleteBookTarget(b);
    setDeleteBookModalOpen(true);
  }

  function closeDeleteBookModal() {
    setDeleteBookModalOpen(false);
    setDeleteBookTarget(null);
  }

  async function confirmDeleteBook() {
    const b = deleteBookTarget;
    if (!b) return;
    setBusy(true);
    setStatus("");
    try {
      await deleteBook(b.slug);
      closeDeleteBookModal();
      setShelfPeekSlug(null);
      await refreshBooks();
      if (activeBookRef.current === b.slug) {
        setNavHome(true);
        setHomeCenterTab("welcome");
        setActiveBook("");
        setSelectedChapter(null);
        setSelectedCard(null);
        setChapterContent("");
        setCardContent("");
      }
      setStatus(`已废弃书籍：《${b.title}》`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function performCreateChapter(bookSlug: string, title: string, chapterIndex?: number) {
    const t = title.trim();
    if (!bookSlug || !t) return;
    setBusy(true);
    setStatus("");
    try {
      await flushSynopsisSave();
      await flushChapterSave();
      const body: { title: string; chapterIndex?: number } = { title: t };
      if (chapterIndex !== undefined) body.chapterIndex = chapterIndex;
      const { chapter } = await createChapter(bookSlug, body);

      if (bookSlug === activeBook) setChapterTitle("");

      if (bookSlug !== activeBook) {
        setActiveBook(bookSlug);
        setNavHome(false);
        setSelectedCard(null);
        setCardContent("");
        cardBaselineRef.current = "";
      }

      await refreshChapters(bookSlug);
      await refreshStory(bookSlug);
      await refreshTimelineIndex(bookSlug).catch(() => {});
      await refreshBooks();

      setSelectedChapter({ bookSlug, filename: chapter.filename });
      const { content } = await readChapter(bookSlug, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setChapterTitleEditing(false);

      // 新建章节后：收起分析面板，并刷新右侧内容整理数据源
      setAuditStreamOpen(false);
      setAuditStreamPhase("idle");
      resetAuditThinkingReveal();
      setAuditRun(null);
      setAuditLedger(null);
      setAuditCharactersIndex(null);
      setTimelineIndex(null);
      void loadAuditArtifacts(bookSlug, chapter.filename);
      setStatus("已新建章节，并写入本地文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openShelfChapterGapModal(b: BookMeta) {
    const gaps = normalizeChapterGapList(b.missingChapterIndexes ?? []);
    if (gaps.length === 0) return;
    setChapterGapModalBookSlug(b.slug);
    setChapterGapModalIndexes(gaps);
    setChapterGapModalDraftTitle("");
    setChapterGapModalOpen(true);
  }

  async function onCreateChapter() {
    if (!activeBook) return;
    if (!chapterTitle.trim()) return;

    // 点击“新增章节”立刻重置右侧内容整理（避免残留上一章的摘要/角色展开/时间线等）
    setRightTab("chapterSummary");
    setExpandedAuditCharIds({});
    setSelectedCard(null);
    setCardContent("");
    cardBaselineRef.current = "";
    setAuditRun(null);
    setAuditLedger(null);
    setAuditCharactersIndex(null);
    setTimelineIndex(null);

    const gaps = normalizeChapterGapList(books.find((b) => b.slug === activeBook)?.missingChapterIndexes ?? []);
    if (gaps.length > 0) {
      setChapterGapModalBookSlug(activeBook);
      setChapterGapModalIndexes(gaps);
      setChapterGapModalDraftTitle(chapterTitle.trim());
      setChapterGapModalOpen(true);
      return;
    }
    await performCreateChapter(activeBook, chapterTitle.trim(), undefined);
  }

  async function confirmChapterGapFill() {
    const t = chapterGapModalDraftTitle.trim();
    const slug = chapterGapModalBookSlug;
    if (!t) {
      setStatus("请先填写章节标题。");
      return;
    }
    if (!slug) return;
    const next = chapterGapModalIndexes[0];
    if (next === undefined) return;
    closeChapterGapModal();
    await performCreateChapter(slug, t, next);
  }

  async function confirmChapterGapSkip() {
    const t = chapterGapModalDraftTitle.trim();
    const slug = chapterGapModalBookSlug;
    if (!t) {
      setStatus("请先填写章节标题。");
      return;
    }
    if (!slug) return;
    closeChapterGapModal();
    await performCreateChapter(slug, t, undefined);
  }

  async function goBookOverview() {
    await flushChapterSave();
    const slug = activeBookRef.current;
    const m = books.find((bk) => bk.slug === slug);
    const s = m?.synopsis ?? "";
    setSynopsisDraft(s);
    synopsisBaselineRef.current = s;
    setSelectedChapter(null);
  }

  async function onOpenChapter(c: ChapterMeta) {
    if (!activeBook) return;
    setBusy(true);
    setStatus("");
    try {
      await flushSynopsisSave();
      await flushChapterSave();
      setSelectedChapter({ bookSlug: activeBook, filename: c.filename });
      const { content } = await readChapter(activeBook, c.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      queueMicrotask(() => scrollChapterToTop());
      void loadAuditArtifacts(activeBook, c.filename);
      resetAuditThinkingReveal();
      setAuditStreamPhase("idle");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadAuditArtifacts(slug: string, chapterFilename: string) {
    try {
      const [{ run }, { ledger }, { index }, { index: timelineIdx }, { index: placesIdx }, { index: orgsIdx }] =
        await Promise.all([
        getAuditLatest(slug, chapterFilename).catch(() => ({ run: null })),
        getAuditLedger(slug).catch(() => ({ ledger: null })),
        getAuditCharacters(slug).catch(() => ({ index: null })),
        getTimelineIndex(slug).catch(() => ({ index: null as any })),
        getAuditPlaces(slug).catch(() => ({ index: null as any })),
        getAuditOrgs(slug).catch(() => ({ index: null as any }))
      ]);
      setAuditRun(run);
      setAuditLedger(ledger);
      setAuditCharactersIndex(index);
      setTimelineIndex(timelineIdx);
      setAuditPlacesIndex(placesIdx);
      setAuditOrgsIndex(orgsIdx);
    } catch {
      // ignore
    }
  }

  function openEditPlace(p: any) {
    const name = String(p?.name || "").trim();
    if (!name) return;
    setEditPlaceName(name);
    setEditPlaceDesc(String(p?.description || "").trim());
    setEditPlaceLastNote(String(p?.lastNote || "").trim());
    setEditPlaceOpen(true);
  }

  async function submitEditPlace() {
    if (!activeBook) return;
    const name = editPlaceName.trim();
    if (!name) return;
    try {
      const { index } = await updateAuditPlace(activeBook, {
        name,
        description: editPlaceDesc,
        lastNote: editPlaceLastNote
      });
      setAuditPlacesIndex(index);
      setEditPlaceOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  function openEditOrg(o: any) {
    const name = String(o?.name || "").trim();
    if (!name) return;
    setEditOrgName(name);
    setEditOrgDesc(String(o?.description || "").trim());
    setEditOrgLastNote(String(o?.lastNote || "").trim());
    setEditOrgOpen(true);
  }

  async function submitEditOrg() {
    if (!activeBook) return;
    const name = editOrgName.trim();
    if (!name) return;
    try {
      const { index } = await updateAuditOrg(activeBook, {
        name,
        description: editOrgDesc,
        lastNote: editOrgLastNote
      });
      setAuditOrgsIndex(index);
      setEditOrgOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function refreshTimelineIndex(slug: string) {
    if (!slug) return;
    setTimelineBusy(true);
    try {
      const { index } = await getTimelineIndex(slug);
      setTimelineIndex(index);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setTimelineBusy(false);
    }
  }

  const jumpToOrganize = useCallback(
    (tab: "chapterSummary" | "auditCharacters" | "places" | "orgs" | "timeline" | "story", key: string) => {
      // 额外展开：让“跳转过去”落点是可见的
      if (tab === "auditCharacters") {
        setExpandedAuditCharIds((prev) => ({ ...prev, [key]: true }));
      }
      if (tab === "places") {
        // 展开地点：若在折叠组内，先打开对应组（collapsed=false）
        const places = Array.isArray(auditPlacesIndex?.places) ? (auditPlacesIndex.places as any[]) : [];
        const p = places.find((x) => String(x?.name || "").trim() === key);
        const group = String(p?.group || "").trim();
        if (group) setPlaceGroupCollapsed((prev) => ({ ...prev, [group]: false }));
      }
      if (tab === "orgs") {
        // 组织列表目前没有分组折叠；仅确保卡片本身可见（无需额外展开）
      }

      setRightTab(tab);
      requestAnimationFrame(() => {
        const root = document.querySelector(".organizeTabScroll") as HTMLElement | null;
        if (!root) return;
        const esc = (s: string) => CSS.escape(s);
        const sel =
          tab === "auditCharacters"
            ? `[data-char-name="${esc(key)}"]`
            : tab === "places"
              ? `[data-place-name="${esc(key)}"]`
              : tab === "timeline"
                ? `[data-event-id="${esc(key)}"]`
                : tab === "story"
                  ? `[data-story-path="${esc(key)}"]`
                  : tab === "orgs"
                    ? `[data-org-name="${esc(key)}"]`
                    : "";
        if (!sel) return;
        const el = root.querySelector(sel) as HTMLElement | null;
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("flashFocus");
        window.setTimeout(() => el.classList.remove("flashFocus"), 900);
      });
    },
    [auditPlacesIndex]
  );

  function openEditCharacter(c: any) {
    const name = String(c?.name || "").trim();
    if (!name) return;
    setEditCharName(name);
    setEditCharRole(typeof c?.role === "string" ? c.role : "");
    setEditCharTags(
      Array.isArray(c?.tags) ? (c.tags as any[]).map((x) => String(x)).filter(Boolean).join(", ") : ""
    );
    const st = c?.state && typeof c.state === "object" ? c.state : {};
    try {
      setEditCharStateJson(JSON.stringify(st, null, 2));
    } catch {
      setEditCharStateJson(String(st || ""));
    }
    setEditCharPersonality(String(c?.personalityAnalysis || "").trim());
    setEditCharOpen(true);
  }

  async function submitEditCharacter() {
    if (!activeBook) return;
    const name = editCharName.trim();
    if (!name) return;
    let state: any = undefined;
    const stText = editCharStateJson.trim();
    if (stText) {
      try {
        state = JSON.parse(stText);
      } catch (e: any) {
        setStatus(`state 不是合法 JSON：${e?.message || String(e)}`);
        return;
      }
    }
    const tags = editCharTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    try {
      const { index } = await updateAuditCharacter(activeBook, {
        name,
        role: editCharRole.trim(),
        tags,
        state,
        personalityAnalysis: editCharPersonality.trim()
      });
      setAuditCharactersIndex(index);
      setEditCharOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function onAuditSelectedChapter() {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型：请先在「模型配置」里测试连接，连接成功后再分析。");
      return;
    }
    setAuditBusy(true);
    setStatus("");
    setAuditStreamPhase("running");
    resetAuditThinkingReveal();
    try {
      // 先尽力同步一次（避免服务端没有最新配置）
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});

      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          activeBook
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/audit/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelConfigId: activeModelId ?? null })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadText = line.replace(/^data:\s?/, "");
          try {
            const payload = JSON.parse(payloadText) as any;
            // 只展示“思考过程”：优先消费 reasoning
            if (payload.type === "reasoning") {
              appendAuditThinkingDelta(payload.textDelta ?? "");
            }
            // 兼容：服务端可能仍发送 log（不展示或可切换为展示）
            if (payload.type === "done") {
              if (payload.run) setAuditRun(payload.run);
              await loadAuditArtifacts(activeBook, selectedChapter.filename);
              await refreshTimelineIndex(activeBook);
              setAuditStreamPhase("done");
            }
            if (payload.type === "error") {
              throw new Error(payload.message || "分析失败");
            }
          } catch (e: any) {
            // 如果不是 JSON，就直接当日志
            // 不再展示（避免把最终 JSON 混进“思考过程”）
          }
        }
      }
    } catch (e: any) {
      setAuditStreamPhase("error");
      setStatus(e?.message || String(e));
    } finally {
      setAuditBusy(false);
    }
  }

  async function onPolishSelectedChapter() {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型：请先在「模型配置」里测试连接，连接成功后再润色。");
      return;
    }
    setPolishBusy(true);
    setStatus("");
    setPolishPhase("running");
    const original = polishOriginal || chapterContent;
    setPolishOriginal(original);
    setPolishDraft("");
    try {
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          activeBook
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/polish/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelConfigId: activeModelId ?? null, original })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadText = line.replace(/^data:\s?/, "");
          try {
            const payload = JSON.parse(payloadText) as any;
            if (payload.type === "delta") {
              const d = String(payload.textDelta ?? "");
              if (d) setPolishDraft((prev) => prev + d);
            }
            if (payload.type === "done") {
              const t = String(payload.text ?? "");
              if (t.trim()) setPolishDraft(t);
              setPolishPhase("done");
            }
            if (payload.type === "error") {
              throw new Error(String(payload.message || "润色失败"));
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
      setPolishPhase((p) => (p === "done" ? "done" : "done"));
    } catch (e: any) {
      setPolishPhase("error");
      setStatus(e?.message || String(e));
    } finally {
      setPolishBusy(false);
    }
  }

  async function onExpandWithTargetWords(targetWords: number, extraContext: string) {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型：请先在「模型配置」里测试连接，连接成功后再扩写。");
      return;
    }
    setExpandBusy(true);
    setStatus("");
    setExpandDraft("");
    try {
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          activeBook
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/expand/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelConfigId: activeModelId ?? null,
            original: chapterContent,
            targetWords,
            extraContext
          })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadText = line.replace(/^data:\s?/, "");
          try {
            const payload = JSON.parse(payloadText) as any;
            if (payload.type === "delta") {
              const d = String(payload.textDelta ?? "");
              if (d) setExpandDraft((prev) => prev + d);
            }
            if (payload.type === "done") {
              const t = String(payload.text ?? "");
              if (t.trim()) setExpandDraft(t);
            }
            if (payload.type === "error") {
              throw new Error(String(payload.message || "扩写失败"));
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setExpandBusy(false);
    }
  }

  async function onRenameChapter(): Promise<boolean> {
    if (!activeBook || !selectedChapter || !chapterRenameDraft.trim()) return false;
    setBusy(true);
    setStatus("");
    try {
      await flushChapterSave();
      const { chapter } = await renameChapter(activeBook, selectedChapter.filename, chapterRenameDraft.trim());
      await refreshChapters(activeBook);
      setSelectedChapter({ bookSlug: activeBook, filename: chapter.filename });
      const { content } = await readChapter(activeBook, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setChapterRenameDraft(chapter.title);
      return true;
    } catch (e: any) {
      setStatus(e?.message || String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commitChapterTitleRename() {
    if (!selectedChapterMeta || !canRenameChapterFilename) return;
    const t = chapterRenameDraft.trim();
    if (!t) {
      setChapterRenameDraft(selectedChapterMeta.title);
      setChapterTitleEditing(false);
      return;
    }
    if (t === selectedChapterMeta.title) {
      setChapterTitleEditing(false);
      return;
    }
    chapterTitleSkipBlurRef.current = true;
    const ok = await onRenameChapter();
    chapterTitleSkipBlurRef.current = false;
    if (ok) setChapterTitleEditing(false);
  }

  async function onOpenCard(f: StoryFile) {
    if (!activeBook) return;
    setBusy(true);
    setStatus("");
    try {
      await flushCardSave();
      setSelectedCard({ bookSlug: activeBook, path: f.path });
      const { content } = await readStoryFile(activeBook, f.path);
      setCardContent(content);
      cardBaselineRef.current = content;
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCharacter() {
    if (!activeBook) return;
    const name = modalCharacterName.trim();
    if (!name) return;
    setBusy(true);
    setStatus("");
    try {
      const tags = [...new Set(modalCharacterTags.map((t) => t.trim()).filter(Boolean))].slice(0, 30);
      const { character } = await createCharacter(activeBook, {
        name,
        role: modalCharacterRole,
        tags
      });
      setCreateCharacterModalOpen(false);
      setModalCharacterName("");
      setModalCharacterRole("配角");
      setModalCharacterTags([]);
      setModalCharacterTagDraft("");
      await refreshStory(activeBook);
      // 直接打开新建的卡片
      const f: StoryFile = { kind: "character", path: character.relPath, title: name, role: modalCharacterRole, tags };
      await onOpenCard(f);
      setStatus("已创建角色卡文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openModelConfigEditor(id: string) {
    const cfg = modelConfigs.find((c) => c.id === id);
    if (!cfg) return;
    setModelConfigEditorId(id);
    setModelEditorDraft({ ...cfg });
    setModelTestStatus("");
  }

  function saveModelConfigDraft() {
    if (!modelEditorDraft) return;
    setModelState((prev) => ({
      ...prev,
      configs: prev.configs.map((c) => (c.id === modelEditorDraft.id ? modelEditorDraft : c))
    }));
    setStatus("已保存模型配置。");
  }

  async function testModelConfigDraft() {
    if (!modelEditorDraft) return;
    const cfg = modelEditorDraft;
    if (!cfg.testUrl.trim()) {
      setModelTestStatus("请先填写测试地址。");
      return;
    }
    setModelTestStatus("测试中…");
    try {
      const headers: Record<string, string> = {};
      if (cfg.provider === "openai" || cfg.provider === "deepseek" || cfg.provider === "qwen") {
        if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
      }
      if (cfg.provider === "gemini") {
        // gemini 常用 key=...；这里不强绑，若用户已把 key 写进 url 则不追加
        if (cfg.apiKey.trim() && !cfg.testUrl.includes("key=")) {
          const u = new URL(cfg.testUrl);
          u.searchParams.set("key", cfg.apiKey.trim());
          const next = u.toString();
          setModelEditorDraft({ ...cfg, testUrl: next });
          cfg.testUrl = next;
        }
      }
      if (cfg.extraHeadersJson?.trim()) {
        try {
          const extra = JSON.parse(cfg.extraHeadersJson) as Record<string, string>;
          for (const [k, v] of Object.entries(extra)) headers[k] = String(v);
        } catch {
          setModelTestStatus("extraHeadersJson 不是合法 JSON。");
          return;
        }
      }
      const res = await fetch(cfg.testUrl, { method: "GET", headers });
      const text = await res.text().catch(() => "");
      let suffix = text ? ` · ${text.slice(0, 120)}` : "";
      let lastModels: string[] | undefined = undefined;
      if (cfg.provider === "ollama" || cfg.testUrl.includes("/api/tags")) {
        try {
          const j = JSON.parse(text) as any;
          const names: string[] = Array.isArray(j?.models)
            ? j.models.map((m: any) => String(m?.name || m?.model || "")).filter(Boolean)
            : [];
          if (names.length) {
            const preview = names.slice(0, 6).join("、");
            suffix = ` · 共 ${names.length} 个模型：${preview}${names.length > 6 ? "…" : ""}`;
          }
          // 存一份供“当前模型选择器”使用
          setModelEditorDraft((prev) => (prev ? { ...prev, lastModels: names } : prev));
          lastModels = names;
        } catch {
          // ignore
        }
      }
      const ok = res.status >= 200 && res.status < 300;
      setModelEditorDraft((prev) => (prev ? { ...prev, lastTestOk: ok } : prev));
      setModelState((prev) => ({
        ...prev,
        configs: prev.configs.map((c) =>
          c.id === cfg.id ? { ...c, lastTestOk: ok, lastModels: lastModels ?? c.lastModels } : c
        )
      }));
      setModelTestStatus(`HTTP ${res.status}${suffix}`);
    } catch (e: any) {
      setModelTestStatus(e?.message || String(e));
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand brandButton" onClick={() => void goNavHome()} title="返回书架">
          novel-helper
        </button>
        <div className="hint">
          默认写入 <code>book/</code>（可用 <code>NOVEL_HELPER_DATA_DIR</code> 指定根目录）
        </div>
        <div className="topbarRight">
          <div className="themeLabel">外观</div>
          <select
            className="select"
            value={themePreference}
            onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
            disabled={busy}
            title="跟随系统：随操作系统浅色/深色自动切换"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`btnFullscreenToggle ${fullscreenOn ? "active" : ""}`}
            onClick={() =>
              void toggleDocumentFullscreen().catch(() =>
                setStatus("无法切换全屏：浏览器不支持或权限被拒绝。")
              )
            }
            title={fullscreenOn ? "退出全屏（Esc）" : "全屏显示"}
            aria-label={fullscreenOn ? "退出全屏" : "全屏"}
            aria-pressed={fullscreenOn}
          >
            {fullscreenOn ? <IconFullscreenExit /> : <IconFullscreenEnter />}
          </button>
        </div>
      </header>

      <div className={`layout3 ${navCollapsed ? "layout3NavCollapsed" : ""}`}>
        <aside className="nav">
          {navCollapsed ? null : (
            <div className="navSection navSectionMain">
              {navHome ? (
                <>
                  <div className="navTitle">书架</div>
                  <div className="navShelfHint muted">点击书名展开简介；书名下方显示缺失章节数量；点此新建书籍。</div>
                  <div className="navNewBookRow">
                    <button type="button" className="btnNewBookFull" onClick={() => openCreateBookModal()} disabled={busy}>
                      新建书籍
                    </button>
                  </div>
                  <div className="navSortBar">
                    <button
                      type="button"
                      className="btnSort"
                      disabled={busy || books.length < 2}
                      title={bookShelfSortDesc ? "切换为正序" : "切换为倒序"}
                      onClick={() => setBookShelfSortDesc((v) => !v)}
                    >
                      {bookShelfSortDesc ? "倒序" : "正序"}
                    </button>
                  </div>
                  <div className="tree navListDense bookShelfList">
                    {books.length === 0 ? (
                      <div className="empty">还没有书，先新建一本。</div>
                    ) : (
                      displayedBooks.map((b) => {
                        const gapCount = normalizeChapterGapList(b.missingChapterIndexes ?? []).length;
                        return (
                          <div key={b.slug} className="bookShelfItem">
                            <div
                              role="button"
                              tabIndex={busy ? -1 : 0}
                              className="treeChild bookShelfRow"
                              onClick={() => {
                                if (busy) return;
                                void openBookFromShelf(b);
                              }}
                              onKeyDown={(e) => {
                                if (busy) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  void openBookFromShelf(b);
                                }
                              }}
                              title={`打开全书 · ${b.slug}\n创建：${formatBookCreatedAt(b.createdAt)}\n${b.status} · ${b.chapterCount}章${
                                gapCount ? `\n缺失序号 ${gapCount} 处（进入该书后在左侧书名下处理）` : ""
                              }`}
                            >
                              <span
                                className="bookShelfTitle bookShelfTitleToggle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShelfPeekSlug((prev) => (prev === b.slug ? null : b.slug));
                                }}
                                title="展开或收起简介"
                              >
                                《{b.title}》
                              </span>
                              {gapCount > 0 ? <span className="bookShelfGapCount">缺 {gapCount} 章</span> : null}
                              <span className="bookShelfMeta">
                                {formatBookCreatedAt(b.createdAt)} · {b.status} · {b.chapterCount}章
                              </span>
                            </div>
                            {shelfPeekSlug === b.slug ? (
                              <div className="bookShelfPeek">
                                {b.synopsis?.trim() ? (
                                  <p className="bookShelfPeekText">{b.synopsis}</p>
                                ) : (
                                  <div className="bookShelfPeekEdit">
                                    <textarea
                                      className="bookShelfPeekInput"
                                      value={shelfPeekDraft}
                                      onChange={(e) => setShelfPeekDraft(e.target.value)}
                                      placeholder="暂无简介，在此输入…"
                                      disabled={shelfPeekSaving}
                                      rows={3}
                                      aria-label="书籍简介"
                                    />
                                    <button
                                      type="button"
                                      className="btnPeekSave"
                                      disabled={shelfPeekSaving || busy}
                                      onClick={() => void saveShelfPeekSynopsis(b.slug)}
                                    >
                                      {shelfPeekSaving ? "保存中…" : "保存简介"}
                                    </button>
                                  </div>
                                )}
                                <div className="bookShelfDangerRow">
                                  <button
                                    type="button"
                                    className="btnDanger"
                                    disabled={busy}
                                    onClick={() => openDeleteBookModal(b)}
                                  >
                                    废弃书籍
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="navChapterHeader">
                    <div className="navTitle">{activeBookMeta?.title ?? activeBook}</div>
                    {sortedActiveMissingChapterIndexes.length > 0 && activeBookMeta ? (
                      <button
                        type="button"
                        className="navBookGapHint"
                        disabled={busy}
                        onClick={() => openShelfChapterGapModal(activeBookMeta)}
                        title="选择补齐空缺或接在最大序号之后新建"
                      >
                        空缺：{formatMissingChapterList(sortedActiveMissingChapterIndexes)} · 点此新建
                      </button>
                    ) : null}
                    <div className="navSubtitle">{activeBookMeta?.slug ?? activeBook}</div>
                    <div className="navHint">点击左上角 novel-helper 返回书架</div>
                  </div>
                  <div className="navOverviewBar">
                    <button
                      type="button"
                      className="btnSort btnOverview"
                      disabled={busy || !selectedChapter}
                      title={selectedChapter ? "在中间查看本书信息与简介" : "当前已在书籍概览"}
                      onClick={() => void goBookOverview()}
                    >
                      书籍概览
                    </button>
                  </div>
                  <div className="navSortBar">
                    <button
                      type="button"
                      className="btnSort"
                      disabled={busy || chapters.length < 2}
                      title={chapterSortDesc ? "切换为正序" : "切换为倒序"}
                      onClick={() => setChapterSortDesc((v) => !v)}
                    >
                      {chapterSortDesc ? "倒序" : "正序"}
                    </button>
                  </div>
                  <div className="navChapterBody">
                    <div className="chapterNavScroll">
                      <div className="tree navListDense chapterNavList">
                        {chapters.length === 0 ? (
                          <div className="empty">暂无章节，请在下方新建。</div>
                        ) : (
                          displayedChapters.map((c) => (
                            <button
                              key={c.filename}
                              type="button"
                              className={`treeChild chapterNavItem ${selectedChapter?.filename === c.filename ? "active" : ""}`}
                              onClick={() => void onOpenChapter(c)}
                              disabled={busy}
                            >
                              <span className="chapterNavItemTitle">{c.id}</span>
                              <span className="chapterNavWordCount">{c.wordCount ?? 0} 字</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="row chapterQuickRow chapterQuickRowSticky">
                      <input
                        value={chapterTitle}
                        onChange={(e) => setChapterTitle(e.target.value)}
                        placeholder="新章节标题"
                        disabled={busy}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void onCreateChapter();
                          }
                        }}
                      />
                      <button onClick={() => void onCreateChapter()} disabled={busy || !chapterTitle.trim()}>
                        新建章节
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {navHome ? (
            <div className="navSection navModelConfigSection">
              <button
                type="button"
                className="btnModelConfig"
                disabled={busy}
                title="在中间配置模型与 API Key"
                onClick={() => setHomeCenterTab("model")}
              >
                模型配置
              </button>
            </div>
          ) : null}
        </aside>

        <main className="center">
          <div className="centerTop">
            <div className="centerTitleBlock">
              <div className="centerTitleRow">
                {activeBook || navHome ? (
                  <button
                    type="button"
                    className="btnSidebarToggle"
                    onClick={() => setNavCollapsed((v) => !v)}
                    disabled={busy}
                    aria-label={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
                    aria-pressed={navCollapsed}
                    title={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
                  >
                    <SidebarToggleIcon mirrored={!navCollapsed} />
                  </button>
                ) : null}
                {!activeBook ? (
                  <>
                    <div className="centerTitle">请从书架打开一本书</div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : showBookOverview ? (
                  <>
                    <div className="centerTitle">
                      《{activeBookMeta?.title ?? activeBook}》· 书籍概览
                    </div>
                    <span
                      className={`titleAutosave autosaveHint ${
                        bookOverviewAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="简介停顿约 1 秒后写入 meta.json"
                    >
                      {bookOverviewAutosaveHint}
                    </span>
                  </>
                ) : !selectedChapterMeta ? (
                  <>
                    <div className="centerTitle">章节加载中…</div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : chapterTitleEditing && canRenameChapterFilename ? (
                  <>
                    <input
                      ref={chapterTitleInputRef}
                      className="renameChapterInput renameChapterInputInline"
                      value={chapterRenameDraft}
                      onChange={(e) => setChapterRenameDraft(e.target.value)}
                      disabled={busy}
                      aria-label="章节标题"
                      placeholder="章节标题"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setChapterRenameDraft(selectedChapterMeta.title);
                          setChapterTitleEditing(false);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitChapterTitleRename();
                        }
                      }}
                      onBlur={() => {
                        if (chapterTitleSkipBlurRef.current) return;
                        setChapterRenameDraft(selectedChapterMeta.title);
                        setChapterTitleEditing(false);
                      }}
                    />
                    <span
                      className={`titleAutosave autosaveHint ${
                        chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="编辑停顿约 1 秒后写入磁盘"
                    >
                      {chapterAutosaveHint}
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      className={`centerTitle ${canRenameChapterFilename ? "centerTitleEditable" : ""}`}
                      onDoubleClick={() => {
                        if (!canRenameChapterFilename || !selectedChapterMeta || busy) return;
                        setChapterRenameDraft(selectedChapterMeta.title);
                        setChapterTitleEditing(true);
                        queueMicrotask(() => {
                          chapterTitleInputRef.current?.focus();
                          chapterTitleInputRef.current?.select();
                        });
                      }}
                      title={
                        canRenameChapterFilename ? "双击修改标题（回车确认，Esc 取消）" : undefined
                      }
                    >
                      {selectedChapterMeta.id}
                    </div>
                    <span
                      className={`titleAutosave autosaveHint ${
                        chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="编辑停顿约 1 秒后写入磁盘"
                    >
                      {chapterAutosaveHint}
                    </span>
                  </>
                )}
              </div>
              {selectedChapterMeta && !showBookOverview && !canRenameChapterFilename ? (
                <div className="renameHint">当前文件名需在文件夹中手动改名。</div>
              ) : null}
            </div>
            {!activeBook ? (
              <div className="centerMeta muted">打开一本书后可查看书籍信息、简介与章节正文。</div>
            ) : showBookOverview && activeBookMeta ? (
              <div className="centerMeta centerMetaOverview">
                <span title={activeBookMeta.createdAt}>
                  创建时间：{formatBookCreatedAt(activeBookMeta.createdAt)}
                </span>
                <span className="centerMetaSep">·</span>
                <span>{activeBookMeta.status}</span>
                <span className="centerMetaSep">·</span>
                <span>{activeBookMeta.chapterCount} 章</span>
                <span className="centerMetaSep">·</span>
                <span className="muted">标识 {activeBookMeta.slug}</span>
              </div>
            ) : (
              <div className="centerMeta">字数：{chapterWordCount}</div>
            )}
            {selectedChapter ? (
              <div className="centerReading">
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.prev}
                  onClick={() => adjacentChapters.prev && void onOpenChapter(adjacentChapters.prev)}
                  title={adjacentChapters.prev ? `上一章：${adjacentChapters.prev.id}` : "没有上一章"}
                >
                  上一章
                </button>
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.next}
                  onClick={() => adjacentChapters.next && void onOpenChapter(adjacentChapters.next)}
                  title={adjacentChapters.next ? `下一章：${adjacentChapters.next.id}` : "没有下一章"}
                >
                  下一章
                </button>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={mobileReading}
                    onChange={(e) => setMobileReading(e.target.checked)}
                    disabled={busy || polishModeOn || expandModeOn}
                  />
                  移动端阅读
                </label>
                <button
                  type="button"
                  className={`btnAuditRead ${polishModeOn ? "active" : ""}`}
                  disabled={busy || polishBusy}
                  onClick={() => {
                    if (busy) return;
                    setMobileReading(false);
                    setAuditReadModeOn(false);
                    setExpandModeOn(false);
                    setPolishModeOn((v) => {
                      const next = !v;
                      if (next) {
                        setPolishOriginal(chapterContent);
                        setPolishDraft("");
                        setPolishPhase("idle");
                        void onPolishSelectedChapter();
                      }
                      return next;
                    });
                  }}
                  title={polishModeOn ? "退出润色对照" : "用 AI 润色本章并提供对照"}
                >
                  {polishBusy ? "润色中…" : polishModeOn ? "退出润色" : "润色"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${expandModalOpen ? "active" : ""}`}
                  disabled={busy || expandBusy}
                  onClick={() => {
                    if (busy || !selectedChapter) return;
                    setExpandTargetWords(String(Math.max(200, chapterWordCount + 500)));
                    setExpandExtraContext("");
                    setExpandDraft("");
                    setExpandModalOpen(true);
                  }}
                  title="快速扩写：输入目标字数并结合时间线摘要扩写本章"
                >
                  {expandBusy ? "扩写中…" : "扩写"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${auditReadModeOn ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => setAuditReadModeOn((v) => !v)}
                  title={auditReadModeOn ? "退出审计阅读模式" : "进入审计阅读模式（高亮内容整理关联）"}
                >
                  {auditReadModeOn ? "退出审计" : "审计"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${auditStreamOpen ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => setAuditStreamOpen((v) => !v)}
                  title={auditStreamOpen ? "收起右侧分析面板" : "打开分析面板（可在面板内开始本章分析）"}
                >
                  {auditBusy ? "分析中…" : auditStreamOpen ? "收起面板" : "分析面板"}
                </button>
                <select
                  className="select"
                  value={mobilePreset}
                  onChange={(e) => setMobilePreset(e.target.value as MobilePresetId)}
                  disabled={busy || !mobileReading || polishModeOn || expandModeOn}
                  title="常见机型尺寸预设"
                >
                  {MOBILE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {!activeBook ? (
            homeCenterTab === "model" ? (
              <div className="homeModelConfig">
                <div className="homeModelHeader">
                  <div className="centerMeta">模型配置</div>
                </div>

                {modelConfigEditorId && modelEditorDraft ? (
                  <div className="homeModelEditor">
                    <div className="row">
                      <button
                        type="button"
                        className="btnBack"
                        onClick={() => {
                          setModelConfigEditorId(null);
                          setModelEditorDraft(null);
                          setModelTestStatus("");
                        }}
                        disabled={busy}
                      >
                        返回列表
                      </button>
                      <button
                        type="button"
                        className="btnSort"
                        onClick={() => {
                          setModelState((prev) => ({ ...prev, activeId: modelEditorDraft.id }));
                          setStatus("已设为当前模型配置。");
                        }}
                        disabled={busy}
                      >
                        设为当前
                      </button>
                    </div>

                    <div className="modelField">
                      <div className="navSubtitle">名称</div>
                      <input
                        value={modelEditorDraft.label}
                        onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, label: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div className="modelField">
                      <div className="navSubtitle">API Key</div>
                      <input
                        value={modelEditorDraft.apiKey}
                        onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, apiKey: e.target.value })}
                        placeholder="可留空（如 Ollama）"
                        disabled={busy}
                      />
                    </div>
                    <div className="modelField">
                      <div className="navSubtitle">测试地址</div>
                      <input
                        value={modelEditorDraft.testUrl}
                        onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, testUrl: e.target.value })}
                        placeholder="例如 https://api.openai.com/v1/models"
                        disabled={busy}
                      />
                    </div>
                    <div className="modelField">
                      <div className="navSubtitle">模型名（可选）</div>
                      <input
                        value={modelEditorDraft.model ?? ""}
                        onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, model: e.target.value })}
                        placeholder="例如 gpt-4.1-mini / deepseek-chat / gemini-1.5-flash"
                        disabled={busy}
                      />
                    </div>
                    {modelEditorDraft.provider === "custom" ? (
                      <div className="modelField">
                        <div className="navSubtitle">额外 Headers（JSON，可选）</div>
                        <textarea
                          className="modelHeadersTextarea"
                          value={modelEditorDraft.extraHeadersJson ?? ""}
                          onChange={(e) =>
                            setModelEditorDraft({ ...modelEditorDraft, extraHeadersJson: e.target.value })
                          }
                          placeholder='例如 {"X-My-Header":"123"}'
                          disabled={busy}
                          rows={3}
                        />
                      </div>
                    ) : null}

                    <div className="row">
                      <button type="button" className="btnSort" onClick={() => void testModelConfigDraft()} disabled={busy}>
                        测试连接
                      </button>
                      <button
                        type="button"
                        className="btnModalPrimary"
                        onClick={() => saveModelConfigDraft()}
                        disabled={busy || !modelEditorDraft.label.trim()}
                      >
                        保存
                      </button>
                    </div>
                    {modelTestStatus ? <div className="empty">{modelTestStatus}</div> : null}
                  </div>
                ) : (
                  <div className="homeModelList">
                    <div className="modelProviderGrid">
                      {BUILTIN_MODEL_PROVIDERS.map((p) => {
                        const c = modelConfigs.find((x) => x.provider === p.id) ?? defaultConfigFor(p.id);
                        const configured =
                          p.id === "ollama"
                            ? Boolean(c.baseUrl?.trim())
                            : p.id === "custom"
                              ? Boolean(c.testUrl?.trim() || c.baseUrl?.trim())
                              : Boolean(c.apiKey?.trim());
                        const statusText = c.lastTestOk ? "已连接" : configured ? "已配置" : "未配置";
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`modelProviderCard ${c.id === activeModelId ? "active" : ""}`}
                            onClick={() => openModelConfigEditor(c.id)}
                            disabled={busy}
                            title="点击配置"
                          >
                            <div className="modelProviderTop">
                              <div className="modelProviderName">{p.label}</div>
                              <span
                                className={`modelProviderDot ${
                                  c.lastTestOk ? "ok" : configured ? "warn" : "off"
                                }`}
                              />
                            </div>
                            <div className="modelProviderStatus">{statusText}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty centerBodyHint">从左侧书架选择一本书开始。</div>
            )
          ) : showBookOverview ? (
            <div className="bookOverview">
              <div className="bookOverviewSynopsisLabel">简介</div>
              <textarea
                className="bookOverviewSynopsis"
                value={synopsisDraft}
                onChange={(e) => setSynopsisDraft(e.target.value)}
                disabled={busy}
                placeholder="写一句简介或内容简介…（保存到书籍 meta.json）"
                aria-label="书籍简介"
              />
            </div>
          ) : mobileReading ? (
            <div className="mobileStage">
              <div
                className="mobilePhone"
                style={{ width: `${mobileViewport.w}px`, height: `${mobileViewport.h}px` }}
              >
                {expandModeOn ? (
                  <div className="polishSplit">
                    <div className="polishHead">
                      <div className="polishTitle">
                        扩写对照
                        <span className="polishCounts muted">
                          原文 {approximateWordCount(chapterContent)} 字 · 扩写后 {approximateWordCount(expandDraft)} 字
                        </span>
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy}
                          onClick={() => {
                            setExpandModeOn(false);
                            setExpandModalOpen(true);
                          }}
                          title="修改目标字数/补充信息并重新扩写"
                        >
                          重新扩写
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy || !expandDraft.trim()}
                          onClick={() => {
                            setChapterContent(expandDraft);
                            setExpandModeOn(false);
                            setExpandDraft("");
                          }}
                          title="用扩写结果替换正文"
                        >
                          一键更换
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy}
                          onClick={() => {
                            setExpandModeOn(false);
                            setExpandDraft("");
                          }}
                        >
                          退出扩写
                        </button>
                      </div>
                    </div>
                    <div className="polishCols">
                      <div className="polishCol">
                        <div className="polishColTitle muted">原文</div>
                        <div className="polishText">{chapterContent}</div>
                      </div>
                      <div className="polishCol">
                        <div className="polishColTitle muted">扩写后</div>
                        <div className="polishText">{expandDraft || (expandBusy ? "扩写中…" : "—")}</div>
                      </div>
                    </div>
                  </div>
                ) : polishModeOn ? (
                  <div className="polishSplit">
                    <div className="polishHead">
                      <div className="polishTitle">
                        润色对照
                        <span className="polishCounts muted">
                          原文 {approximateWordCount(polishOriginal || chapterContent)} 字 · 润色后{" "}
                          {approximateWordCount(polishDraft)} 字
                        </span>
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || polishBusy || !okModelConfigs.length}
                          onClick={() => void onPolishSelectedChapter()}
                          title={!okModelConfigs.length ? "请先在「模型配置」里测试连接" : "重新润色（覆盖右侧润色稿）"}
                        >
                          重新润色
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || polishBusy || !polishDraft.trim()}
                          onClick={() => {
                            setChapterContent(polishDraft);
                            setPolishModeOn(false);
                            setPolishPhase("idle");
                            setPolishOriginal("");
                            setPolishDraft("");
                          }}
                          title="用右侧润色稿替换正文"
                        >
                          一键更换
                        </button>
                      </div>
                    </div>
                    <div className="polishCols">
                      <div className="polishCol">
                        <div className="polishColTitle muted">原文</div>
                        <div className="polishText">{polishOriginal || chapterContent}</div>
                      </div>
                      <div className="polishCol">
                        <div className="polishColTitle muted">润色后</div>
                          <div className="polishDiffPreview" aria-label="润色改动标记预览">
                            {diffChars(polishOriginal || chapterContent, polishDraft).map((seg, idx) =>
                              seg.t === "ins" ? (
                                <span key={idx} className="polishDiffIns">
                                  {seg.s}
                                </span>
                              ) : seg.t === "eq" ? (
                                <span key={idx}>{seg.s}</span>
                              ) : null
                            )}
                          </div>
                      </div>
                    </div>
                  </div>
                ) : auditReadModeOn ? (
                  <div ref={auditReaderRootRef} className="auditReader">
                    {(() => {
                      const paras = splitParagraphs(chapterContent);
                      const targets = buildAuditTargets({
                        auditCharactersIndex,
                        auditPlacesIndex,
                        auditOrgsIndex,
                        timelineIndex,
                        storyFiles
                      });
                      const terms = [...targets]
                        .map((t) => ({ term: t.display, target: t }))
                        .filter((x) => x.term.length >= 2)
                        .sort((a, b) => b.term.length - a.term.length);
                      const recent = new Map<string, number>();
                      const N = 10;

                      const renderPara = (text: string, pi: number) => {
                        const hits: Array<{ start: number; end: number; target: AuditLinkTarget; term: string }> = [];
                        const used: Array<{ start: number; end: number }> = [];
                        const overlap = (s: number, e: number) =>
                          used.some((u) => Math.max(u.start, s) < Math.min(u.end, e));

                        for (const { term, target } of terms) {
                          const last = recent.get(term);
                          if (last !== undefined && pi - last < N) continue;
                          const idx = text.indexOf(term);
                          if (idx < 0) continue;
                          const s = idx;
                          const e = idx + term.length;
                          if (overlap(s, e)) continue;
                          hits.push({ start: s, end: e, target, term });
                          used.push({ start: s, end: e });
                          recent.set(term, pi);
                        }
                        hits.sort((a, b) => a.start - b.start);
                        if (!hits.length) return <div className="auditPara">{text}</div>;

                        const parts: React.ReactNode[] = [];
                        let cursor = 0;
                        for (const h of hits) {
                          if (h.start > cursor) parts.push(<span key={`${pi}-${cursor}`}>{text.slice(cursor, h.start)}</span>);
                          parts.push(
                            <span
                              key={`${pi}-${h.start}-${h.end}`}
                              className={`auditLink auditLink_${h.target.kind}`}
                              onMouseEnter={(e) => {
                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setAuditHover({
                                  target: h.target,
                                  rect: { left: r.left, top: r.top, width: r.width, height: r.height }
                                });
                              }}
                              onMouseLeave={() => setAuditHover(null)}
                              onClick={() => jumpToOrganize(h.target.jump.tab, h.target.jump.key)}
                              role="button"
                              tabIndex={0}
                              title={h.target.display}
                            >
                              {text.slice(h.start, h.end)}
                            </span>
                          );
                          cursor = h.end;
                        }
                        if (cursor < text.length) parts.push(<span key={`${pi}-tail`}>{text.slice(cursor)}</span>);
                        return <div className="auditPara">{parts}</div>;
                      };

                      return (
                        <>
                          {paras.length ? paras.map((p, i) => <React.Fragment key={i}>{renderPara(p, i)}</React.Fragment>) : (
                            <div className="muted auditPanelEmpty">暂无正文。</div>
                          )}
                        </>
                      );
                    })()}
                    {auditHover ? (
                      <div
                        className="auditTooltip"
                        style={{
                          left: Math.min(
                            window.innerWidth - 320,
                            Math.max(10, auditHover.rect.left)
                          ),
                          top: Math.min(
                            window.innerHeight - 180,
                            Math.max(10, auditHover.rect.top + auditHover.rect.height + 8)
                          )
                        }}
                        onMouseEnter={() => {}}
                        onMouseLeave={() => setAuditHover(null)}
                      >
                        <div className="auditTooltipTitle">{auditHover.target.display}</div>
                        <div className="auditTooltipBody">
                          {auditHover.target.summaryLines.map((l, i) => (
                            <div key={i} className="auditTooltipLine">
                              {l}
                            </div>
                          ))}
                        </div>
                        <div className="auditTooltipActions">
                          <button
                            type="button"
                            className="btnSort"
                            onClick={() => jumpToOrganize(auditHover.target.jump.tab, auditHover.target.jump.key)}
                          >
                            去内容整理查看
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <textarea
                    className="mobileTextarea"
                    ref={chapterTextareaRef}
                    value={chapterContent}
                    onChange={(e) => setChapterContent(e.target.value)}
                    disabled={busy || !selectedChapter}
                    placeholder="在左侧选择章节或新建章节后开始写作…"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className={`chapterSplit ${auditStreamOpen ? "open" : ""}`}>
              <div className="chapterSplitLeft">
                {expandModeOn ? (
                  <div className="polishSplit">
                    <div className="polishHead">
                      <div className="polishTitle">
                        扩写对照
                        <span className="polishCounts muted">
                          原文 {approximateWordCount(chapterContent)} 字 · 扩写后 {approximateWordCount(expandDraft)} 字
                        </span>
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy}
                          onClick={() => {
                            setExpandModeOn(false);
                            setExpandModalOpen(true);
                          }}
                          title="修改目标字数/补充信息并重新扩写"
                        >
                          重新扩写
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy || !expandDraft.trim()}
                          onClick={() => {
                            setChapterContent(expandDraft);
                            setExpandModeOn(false);
                            setExpandDraft("");
                          }}
                          title="用扩写结果替换正文"
                        >
                          一键更换
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || expandBusy}
                          onClick={() => {
                            setExpandModeOn(false);
                            setExpandDraft("");
                          }}
                        >
                          退出扩写
                        </button>
                      </div>
                    </div>
                    <div className="polishCols">
                      <div className="polishCol">
                        <div className="polishColTitle muted">原文</div>
                        <div className="polishText">{chapterContent}</div>
                      </div>
                      <div className="polishCol">
                        <div className="polishColTitle muted">扩写后</div>
                        <div className="polishText">{expandDraft || (expandBusy ? "扩写中…" : "—")}</div>
                      </div>
                    </div>
                  </div>
                ) : polishModeOn ? (
                  <div className="polishSplit">
                    <div className="polishHead">
                      <div className="polishTitle">
                        润色对照
                        <span className="polishCounts muted">
                          原文 {approximateWordCount(polishOriginal || chapterContent)} 字 · 润色后{" "}
                          {approximateWordCount(polishDraft)} 字
                        </span>
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || polishBusy || !okModelConfigs.length}
                          onClick={() => void onPolishSelectedChapter()}
                          title={!okModelConfigs.length ? "请先在「模型配置」里测试连接" : "重新润色（覆盖右侧润色稿）"}
                        >
                          重新润色
                        </button>
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || polishBusy || !polishDraft.trim()}
                          onClick={() => {
                            setChapterContent(polishDraft);
                            setPolishModeOn(false);
                            setPolishPhase("idle");
                            setPolishOriginal("");
                            setPolishDraft("");
                          }}
                          title="用右侧润色稿替换正文"
                        >
                          一键更换
                        </button>
                      </div>
                    </div>
                    <div className="polishCols">
                      <div className="polishCol">
                        <div className="polishColTitle muted">原文</div>
                        <div className="polishText">{polishOriginal || chapterContent}</div>
                      </div>
                      <div className="polishCol">
                        <div className="polishColTitle muted">润色后</div>
                        <div className="polishDiffPreview" aria-label="润色改动标记预览">
                          {diffChars(polishOriginal || chapterContent, polishDraft).map((seg, idx) =>
                            seg.t === "ins" ? (
                              <span key={idx} className="polishDiffIns">
                                {seg.s}
                              </span>
                            ) : seg.t === "eq" ? (
                              <span key={idx}>{seg.s}</span>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : auditReadModeOn ? (
                  <div ref={auditReaderRootRef} className="auditReader">
                    {(() => {
                      const paras = splitParagraphs(chapterContent);
                      const targets = buildAuditTargets({
                        auditCharactersIndex,
                        auditPlacesIndex,
                        auditOrgsIndex,
                        timelineIndex,
                        storyFiles
                      });
                      const terms = [...targets]
                        .map((t) => ({ term: t.display, target: t }))
                        .filter((x) => x.term.length >= 2)
                        .sort((a, b) => b.term.length - a.term.length);
                      const recent = new Map<string, number>();
                      const N = 10;

                      const renderPara = (text: string, pi: number) => {
                        const hits: Array<{ start: number; end: number; target: AuditLinkTarget; term: string }> = [];
                        const used: Array<{ start: number; end: number }> = [];
                        const overlap = (s: number, e: number) =>
                          used.some((u) => Math.max(u.start, s) < Math.min(u.end, e));

                        for (const { term, target } of terms) {
                          const last = recent.get(term);
                          if (last !== undefined && pi - last < N) continue;
                          const idx = text.indexOf(term);
                          if (idx < 0) continue;
                          const s = idx;
                          const e = idx + term.length;
                          if (overlap(s, e)) continue;
                          hits.push({ start: s, end: e, target, term });
                          used.push({ start: s, end: e });
                          recent.set(term, pi);
                        }
                        hits.sort((a, b) => a.start - b.start);
                        if (!hits.length) return <div className="auditPara">{text}</div>;

                        const parts: React.ReactNode[] = [];
                        let cursor = 0;
                        for (const h of hits) {
                          if (h.start > cursor)
                            parts.push(<span key={`${pi}-${cursor}`}>{text.slice(cursor, h.start)}</span>);
                          parts.push(
                            <span
                              key={`${pi}-${h.start}-${h.end}`}
                              className={`auditLink auditLink_${h.target.kind}`}
                              onMouseEnter={(e) => {
                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setAuditHover({
                                  target: h.target,
                                  rect: { left: r.left, top: r.top, width: r.width, height: r.height }
                                });
                              }}
                              onMouseLeave={() => setAuditHover(null)}
                              onClick={() => jumpToOrganize(h.target.jump.tab, h.target.jump.key)}
                              role="button"
                              tabIndex={0}
                              title={h.target.display}
                            >
                              {text.slice(h.start, h.end)}
                            </span>
                          );
                          cursor = h.end;
                        }
                        if (cursor < text.length)
                          parts.push(<span key={`${pi}-tail`}>{text.slice(cursor)}</span>);
                        return <div className="auditPara">{parts}</div>;
                      };

                      return (
                        <>
                          {paras.length ? (
                            paras.map((p, i) => <React.Fragment key={i}>{renderPara(p, i)}</React.Fragment>)
                          ) : (
                            <div className="muted auditPanelEmpty">暂无正文。</div>
                          )}
                        </>
                      );
                    })()}
                    {auditHover ? (
                      <div
                        className="auditTooltip"
                        style={{
                          left: Math.min(window.innerWidth - 320, Math.max(10, auditHover.rect.left)),
                          top: Math.min(
                            window.innerHeight - 180,
                            Math.max(10, auditHover.rect.top + auditHover.rect.height + 8)
                          )
                        }}
                        onMouseLeave={() => setAuditHover(null)}
                      >
                        <div className="auditTooltipTitle">{auditHover.target.display}</div>
                        <div className="auditTooltipBody">
                          {auditHover.target.summaryLines.map((l, i) => (
                            <div key={i} className="auditTooltipLine">
                              {l}
                            </div>
                          ))}
                        </div>
                        <div className="auditTooltipActions">
                          <button
                            type="button"
                            className="btnSort"
                            onClick={() => jumpToOrganize(auditHover.target.jump.tab, auditHover.target.jump.key)}
                          >
                            去内容整理查看
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <textarea
                    ref={chapterTextareaRef}
                    value={chapterContent}
                    onChange={(e) => setChapterContent(e.target.value)}
                    disabled={busy || !selectedChapter}
                    placeholder="在左侧选择章节或新建章节后开始写作…"
                  />
                )}
              </div>
              {auditStreamOpen ? (
                <div className="chapterSplitRight" aria-label="分析流式输出">
                  <div className="chapterSplitRightHeader">
                    <div className="chapterSplitRightTitle">
                      {auditStreamPhase === "running"
                        ? "分析中"
                        : auditStreamPhase === "error"
                          ? "分析失败"
                          : auditStreamText.trim()
                            ? "分析完成"
                            : "分析面板"}
                    </div>
                    {auditStreamPhase !== "running" && auditStreamText.trim() ? (
                      <div className="row">
                        <button
                          type="button"
                          className="btnSort"
                          onClick={() => void onAuditSelectedChapter()}
                          disabled={busy || auditBusy || !selectedChapter || !okModelConfigs.length}
                          title={!okModelConfigs.length ? "请先在「模型配置」里测试连接" : "重新调用模型分析本章"}
                        >
                          重新分析
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div ref={auditStreamRef} className="auditStream">
                    {auditStreamText.trim() ? (
                      <div className="auditStreamInner auditStreamMd">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{auditStreamText}</ReactMarkdown>
                      </div>
                    ) : auditBusy ? (
                      <div className="auditStreamInner muted">请稍候…</div>
                    ) : (
                      <div className="auditStreamEmpty">
                        <button
                          type="button"
                          className="btnAuditStartChapter"
                          disabled={busy || auditBusy || !okModelConfigs.length}
                          onClick={() => void onAuditSelectedChapter()}
                          title={
                            !okModelConfigs.length
                              ? "请先在「模型配置」里测试连接，连接成功后再分析"
                              : "调用当前模型分析本章（摘要与右侧内容整理将一并更新）"
                          }
                        >
                          开始分析
                        </button>
                        {!okModelConfigs.length ? (
                          <div className="muted auditStreamEmptyHint">
                            暂无连接成功的模型，请先到「模型配置」测试连接。
                          </div>
                        ) : (
                          <div className="muted auditStreamEmptyHint">
                            使用右侧所选模型梳理本章要点。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {status ? <div className="status">{status}</div> : null}
        </main>

        <aside className="right">
          <section className="panel">
            <div className="contentOrganizeHeader">
              <div className="panelTitle contentOrganizeTitle">内容整理</div>
              <div className="auditModelPicker auditModelPickerHeader">
                <button
                  type="button"
                  className="auditModelBtn"
                  disabled={busy || okModelConfigs.length === 0}
                  onClick={() => setAuditModelPickerOpen((v) => !v)}
                  title={
                    okModelConfigs.length === 0
                      ? "暂无连接成功的模型，请先去「模型配置」里测试连接"
                      : "选择具体模型（仅显示连接成功的）"
                  }
                >
                  <span className="auditModelBtnText">{activeModelLabel}</span>
                  <span className="auditModelBtnCaret">▾</span>
                </button>

                {auditModelPickerOpen ? (
                  <div className="auditModelPopover" role="listbox" aria-label="选择模型">
                    <input
                      className="auditModelSearch"
                      placeholder="搜索模型..."
                      value={auditModelSearch}
                      onChange={(e) => setAuditModelSearch(e.target.value)}
                      disabled={busy}
                      autoFocus
                    />
                    <div className="auditModelList">
                      {okModelGroupsFiltered.length ? (
                        okModelGroupsFiltered.map((g) => (
                          <div key={g.id} className="auditModelGroup">
                            <div className="auditModelGroupTitle">{g.label}</div>
                            {g.items.map((it: any) => {
                              const text = it.label;
                              const checked =
                                it.configId === activeModelId &&
                                (it.kind !== "ollamaModel" ||
                                  text === (okModelConfigs.find((x) => x.id === activeModelId)?.model ?? "").trim());
                              return (
                                <button
                                  key={it.id}
                                  type="button"
                                  className={`auditModelItem ${checked ? "active" : ""}`}
                                  role="option"
                                  aria-selected={checked}
                                  onClick={() => {
                                    setModelState((prev) => ({
                                      ...prev,
                                      activeId: it.configId,
                                      configs:
                                        it.kind === "ollamaModel"
                                          ? prev.configs.map((c) =>
                                              c.id === it.configId ? { ...c, model: it.modelName } : c
                                            )
                                          : prev.configs
                                    }));
                                    setAuditModelPickerOpen(false);
                                    setAuditModelSearch("");
                                  }}
                                  disabled={busy}
                                >
                                  <span className="auditModelItemText">{text}</span>
                                  {checked ? <span className="auditModelItemCheck">✓</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        <div className="auditModelEmpty muted">没有匹配的模型。</div>
                      )}
                    </div>
                    <button type="button" className="auditModelManage" onClick={() => void goModelConfigList()}>
                      模型配置
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {!activeBook ? (
              <div className="rightNeedBook muted">请选择一本书</div>
            ) : (
              <>
                <div className="browserTabsBar" role="tablist" aria-label="内容整理页签">
                  <div className="browserTabsStrip">
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "chapterSummary" ? "active" : ""}`}
                      aria-selected={rightTab === "chapterSummary"}
                      onClick={() => setRightTab("chapterSummary")}
                      disabled={busy}
                    >
                      本章摘要
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "auditCharacters" ? "active" : ""}`}
                      aria-selected={rightTab === "auditCharacters"}
                      onClick={() => setRightTab("auditCharacters")}
                      disabled={busy}
                    >
                      角色
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "story" ? "active" : ""}`}
                      aria-selected={rightTab === "story"}
                      onClick={() => setRightTab("story")}
                      disabled={busy}
                    >
                      资料
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "places" ? "active" : ""}`}
                      aria-selected={rightTab === "places"}
                      onClick={() => setRightTab("places")}
                      disabled={busy}
                    >
                      地点
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "orgs" ? "active" : ""}`}
                      aria-selected={rightTab === "orgs"}
                      onClick={() => setRightTab("orgs")}
                      disabled={busy}
                    >
                      组织
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${rightTab === "timeline" ? "active" : ""}`}
                      aria-selected={rightTab === "timeline"}
                      onClick={() => setRightTab("timeline")}
                      disabled={busy}
                    >
                      时间线
                    </button>
                  </div>
                </div>

                <div className="organizeTabScroll">
                  {rightTab === "chapterSummary" ? (
                    <div className="auditPanel">
                      {auditRun ? (
                        <div className="auditPanelBody">
                          <div className="auditPanelTitle">本章摘要</div>
                          <div className="auditPanelMuted muted">
                            {auditRun?.chapter?.filename ? `来源：${auditRun.chapter.filename}` : "未选择章节"}
                          </div>
                          {typeof auditRun?.gistL1 === "string" && auditRun.gistL1.trim() ? (
                            <div className="auditGist">{auditRun.gistL1}</div>
                          ) : null}
                          {Array.isArray(auditRun?.impactAnalysis) && auditRun.impactAnalysis.length ? (
                            <div className="auditImpacts">
                              {(auditRun.impactAnalysis as any[]).slice(0, 12).map((it, idx) => (
                                <div key={idx} className="auditImpactItem">
                                  <div className="auditImpactTop">
                                    <span className="auditImpactScore">{it?.impactScore ?? 0}</span>
                                    <span className="auditImpactText">{it?.item ?? ""}</span>
                                  </div>
                                  {it?.why ? <div className="muted auditImpactWhy">{it.why}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {Array.isArray(auditRun?.consistencyChecks) && auditRun.consistencyChecks.length ? (
                            <div className="auditChecks">
                              <div className="auditPanelTitle">一致性问题</div>
                              {(auditRun.consistencyChecks as any[]).slice(0, 12).map((c, idx) => (
                                <div key={idx} className="auditCheckItem">
                                  <div className="auditCheckIssue">{c?.issue ?? ""}</div>
                                  {c?.suggestion ? <div className="muted auditCheckSug">{c.suggestion}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="muted auditPanelEmpty">暂无分析结果。选中章节后点击「分析」。</div>
                      )}
                    </div>
                  ) : rightTab === "auditCharacters" ? (
                    <>
                      <div className="auditCharList">
                        {Array.isArray(auditCharactersIndex?.characters) &&
                        (auditCharactersIndex.characters as any[]).length ? (
                          (() => {
                            const all = (auditCharactersIndex.characters as any[])
                              .map((c) => ({
                                ...c,
                                name: String(c?.name || "").trim()
                              }))
                              .filter((c) => c.name);
                            const hiddenSet = new Set(
                              Array.isArray(auditCharactersIndex?.hiddenNames)
                                ? (auditCharactersIndex.hiddenNames as any[]).map((x) => String(x))
                                : []
                            );
                            const visible = all.filter((c) => !hiddenSet.has(c.name));

                            return (
                              <>
                                {visible.map((c) => {
                                  const name = String(c?.name || "").trim() || "未命名";
                                  const id = name;
                                  const open = !!expandedAuditCharIds[id];
                                  const roleStr = typeof c?.role === "string" && c.role.trim() ? c.role.trim() : "";
                                  const st = c?.state && typeof c.state === "object" ? c.state : {};
                                  const loc = String((st as any).location ?? "").trim();
                                  const inj = String((st as any).injuries ?? "").trim();
                                  const items = Array.isArray((st as any).items)
                                    ? ((st as any).items as unknown[]).map((x) => String(x)).filter(Boolean)
                                    : [];
                                  const money = (st as any).moneyChange;
                                  const tagArr = Array.isArray(c?.tags)
                                    ? (c.tags as unknown[]).map((x) => String(x)).filter(Boolean)
                                    : [];
                                  const personality = String((c as any)?.personalityAnalysis ?? "").trim();

                                  return (
                                    <div key={id} className="auditCharCard" data-char-name={name}>
                                      <div className="auditCharCardHeadRow">
                                        <button
                                          type="button"
                                          className="auditCharCardHead"
                                          aria-expanded={open}
                                          onClick={() =>
                                            setExpandedAuditCharIds((prev) => ({ ...prev, [id]: !prev[id] }))
                                          }
                                          onDoubleClick={() => {
                                            openEditCharacter(c);
                                          }}
                                          disabled={busy}
                                          title="双击可编辑角色属性"
                                        >
                                          <span className="auditCharIcon" aria-hidden>
                                            ◎
                                          </span>
                                          <span className="auditCharName">{name}</span>
                                          <span className="auditCharBadges">
                                            {roleStr ? (
                                              <span className={auditCharacterRoleClass(roleStr)}>{roleStr}</span>
                                            ) : null}
                                          </span>
                                          <span className={`auditCharChevron ${open ? "open" : ""}`} aria-hidden>
                                            ›
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          className="btnSort btnCharEdit"
                                          disabled={busy || !activeBook}
                                          onClick={() => openEditCharacter(c)}
                                          title="编辑角色属性"
                                        >
                                          编辑
                                        </button>
                                        <button
                                          type="button"
                                          className="btnSort btnCharHide"
                                          disabled={busy || !activeBook}
                                          onClick={async () => {
                                            if (!activeBook) return;
                                            try {
                                              const { index } = await hideAuditCharacter(activeBook, {
                                                name,
                                                hidden: true
                                              });
                                              setAuditCharactersIndex(index);
                                            } catch (e: any) {
                                              setStatus(e?.message || String(e));
                                            }
                                          }}
                                          title="隐藏该角色（全书范围）"
                                        >
                                          隐藏
                                        </button>
                                      </div>

                                      {open ? (
                                        <div className="auditCharCardBody">
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">身份</div>
                                            <div className="auditCharDetailValue">{roleStr || "—"}</div>
                                          </div>
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">标签</div>
                                            <div className="auditCharDetailValue">
                                              {tagArr.length ? tagArr.join("、") : "—"}
                                            </div>
                                          </div>
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">地点</div>
                                            <div className="auditCharDetailValue">{loc || "—"}</div>
                                          </div>
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">伤势与状态</div>
                                            <div className="auditCharDetailValue">{inj || "—"}</div>
                                          </div>
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">随身物品</div>
                                            <div className="auditCharDetailValue">
                                              {items.length ? items.join("、") : "—"}
                                            </div>
                                          </div>
                                          <div className="auditCharDetailRow">
                                            <div className="auditCharDetailLabel">金钱变动</div>
                                            <div className="auditCharDetailValue">
                                              {money !== undefined && money !== null && money !== ""
                                                ? String(money)
                                                : "—"}
                                            </div>
                                          </div>
                                          {auditCharStateExtraRows(st as Record<string, unknown>).map(([lk, lv], ri) => (
                                            <div key={`st-${lk}-${ri}`} className="auditCharDetailRow">
                                              <div className="auditCharDetailLabel">{lk}</div>
                                              <div className="auditCharDetailValue">{lv}</div>
                                            </div>
                                          ))}
                                          {auditCharTopExtraRows(c as Record<string, unknown>).map(([lk, lv], ri) => (
                                            <div key={`ex-${lk}-${ri}`} className="auditCharDetailRow">
                                              <div className="auditCharDetailLabel">{lk}</div>
                                              <div className="auditCharDetailValue">{lv}</div>
                                            </div>
                                          ))}
                                          <div className="auditCharQuotes">
                                            <div className="auditCharDetailLabel">性格分析</div>
                                            <div className="auditCharDetailValue">
                                              {personality ? personality : "—"}
                                            </div>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}

                                <div className="muted auditHiddenSummary">
                                  {(() => {
                                    const hidden = all.filter((c) => hiddenSet.has(c.name));
                                    if (!hidden.length) return null;
                                    return (
                                      <button
                                        type="button"
                                        className="btnLinkMuted"
                                        disabled={busy || !activeBook}
                                        onClick={() => setHiddenCharPanelOpen(true)}
                                      >
                                        已隐藏 {hidden.length}/{all.length} 个角色，点击查看
                                      </button>
                                    );
                                  })()}
                                </div>
                              </>
                            );
                          })()
                        ) : (
                          <div className="muted auditPanelEmpty">暂无角色库。完成一次分析后会自动沉淀到这里。</div>
                        )}
                      </div>
                    </>
                  ) : rightTab === "places" ? (
                    <div className="placePanel">
                      {Array.isArray(auditPlacesIndex?.places) && (auditPlacesIndex.places as any[]).length ? (
                        (() => {
                          const all = (auditPlacesIndex.places as any[])
                            .map((p) => ({ ...p, name: String(p?.name || "").trim() }))
                            .filter((p) => p.name);
                          const hiddenSet = new Set(
                            Array.isArray(auditPlacesIndex?.hiddenNames)
                              ? (auditPlacesIndex.hiddenNames as any[]).map((x) => String(x))
                              : []
                          );
                          const visible = all.filter((p) => !hiddenSet.has(p.name));
                          const inferGroup = (name: string) => {
                            const n = String(name || "").trim();
                            if (!n) return "未分组";
                            // 常见写法：青石村·晒谷场 / 青石村-晒谷场 / 青石村 晒谷场
                            const m = n.split(/[·•—\-\/\s]/).map((s) => s.trim()).filter(Boolean);
                            return m[0] ? m[0] : "未分组";
                          };
                          const groups = new Map<string, any[]>();
                          for (const p of visible) {
                            const g = String((p as any).group || "").trim() || inferGroup(p.name);
                            if (!groups.has(g)) groups.set(g, []);
                            groups.get(g)!.push(p);
                          }
                          const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
                          return (
                            <>
                              <div className="placeList">
                                {groupNames.map((g) => {
                                  const list = groups.get(g) || [];
                                  const collapsed = !!placeGroupCollapsed[g];
                                  return (
                                    <div key={g} className="placeGroup">
                                      <button
                                        type="button"
                                        className="placeGroupHead"
                                        onClick={() => setPlaceGroupCollapsed((prev) => ({ ...prev, [g]: !prev[g] }))}
                                        disabled={busy}
                                      >
                                        <span className="placeGroupTitle">{g}</span>
                                        <span className="muted placeGroupCount">{list.length}</span>
                                        <span className={`placeGroupChevron ${collapsed ? "" : "open"}`} aria-hidden>
                                          ›
                                        </span>
                                      </button>
                                      {!collapsed ? (
                                        <div className="placeGroupBody">
                                          {list.map((p) => {
                                            const key = `${g}::${p.name}`;
                                            const expanded = !!placeTextExpanded[key];
                                            const noteText = String(p.lastNote || "").trim() || "—";
                                            const noteNeedToggle = noteText.length >= 36;
                                            return (
                                              <div key={p.name} className="placeCard" data-place-name={p.name}>
                                                <div className="placeCardTop">
                                                  <div className="placeName">{p.name}</div>
                                                  <div className="row">
                                                    <button
                                                      type="button"
                                                      className="btnSort"
                                                      disabled={busy || !activeBook}
                                                      onClick={() => openEditPlace(p)}
                                                    >
                                                      编辑
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="btnSort"
                                                      disabled={busy || !activeBook}
                                                      onClick={async () => {
                                                        if (!activeBook) return;
                                                        try {
                                                          const { index } = await hideAuditPlace(activeBook, {
                                                            name: p.name,
                                                            hidden: true
                                                          });
                                                          setAuditPlacesIndex(index);
                                                        } catch (e: any) {
                                                          setStatus(e?.message || String(e));
                                                        }
                                                      }}
                                                    >
                                                      隐藏
                                                    </button>
                                                  </div>
                                                </div>
                                                <div className="placeBody">
                                                  <div className="placeRow">
                                                    <div className="placeLabel">简述</div>
                                                    <div className="placeValue">
                                                      {String(p.description || "").trim() || "—"}
                                                    </div>
                                                  </div>
                                                  <div className="placeRow">
                                                    <div className="placeLabel">本地发生</div>
                                                    <div className="placeValue">
                                                      <div className={expanded ? "placeNote" : "placeNote placeNoteClamp2"}>
                                                        {noteText}
                                                      </div>
                                                      {noteNeedToggle ? (
                                                        <button
                                                          type="button"
                                                          className="btnLinkMuted placeNoteToggle"
                                                          onClick={() =>
                                                            setPlaceTextExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                                                          }
                                                          disabled={busy}
                                                        >
                                                          {expanded ? "收起" : "…展开"}
                                                        </button>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                  <div className="placeMeta muted">
                                                    {p.lastChapter ? `最近出现：第 ${p.lastChapter} 章` : ""}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="muted auditHiddenSummary">
                                {(() => {
                                  const hidden = all.filter((p) => hiddenSet.has(p.name));
                                  if (!hidden.length) return null;
                                  return (
                                    <button
                                      type="button"
                                      className="btnLinkMuted"
                                      disabled={busy || !activeBook}
                                      onClick={() => setHiddenPlacePanelOpen(true)}
                                    >
                                      已隐藏 {hidden.length}/{all.length} 个地点，点击查看
                                    </button>
                                  );
                                })()}
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <div className="muted auditPanelEmpty">暂无地点卡。完成一次分析后会自动收集地点。</div>
                      )}
                    </div>
                  ) : rightTab === "story" ? (
                    <div className="list">
                      {storyFiles.map((f) => (
                        <button
                          key={f.path}
                          data-story-path={f.path}
                          className={`item ${selectedCard?.path === f.path ? "active" : ""}`}
                          onClick={() => onOpenCard(f)}
                          disabled={busy}
                        >
                          {f.title}
                        </button>
                      ))}
                    </div>
                  ) : rightTab === "timeline" ? (
                    <div className="timelinePanel">
                      <div className="timelineTopRow">
                        <button
                          type="button"
                          className="btnSort"
                          disabled={busy || timelineBusy || !activeBook}
                          onClick={() => activeBook && void refreshTimelineIndex(activeBook)}
                        >
                          刷新
                        </button>
                        <label className="toggle timelineToggle">
                          <input
                            type="checkbox"
                            checked={timelineShowDoneEvents}
                            onChange={(e) => setTimelineShowDoneEvents(e.target.checked)}
                            disabled={busy}
                          />
                          显示已完成事件
                        </label>
                      </div>

                      <div className="timelineSection">
                        <div className="auditPanelTitle">推荐压缩区间</div>
                        {timelineIndex?.compressionSuggestions?.length ? (
                          <div className="timelineSuggestionList">
                            {timelineIndex.compressionSuggestions.map((s, i) => (
                              <button
                                key={`${s.startChapter}-${s.endChapter}-${i}`}
                                type="button"
                                className="timelineSuggestion"
                                disabled={busy || timelineBusy || !activeBook}
                                onClick={async () => {
                                  if (!activeBook) return;
                                  setTimelineCompressStart(String(s.startChapter));
                                  setTimelineCompressEnd(String(s.endChapter));
                                  setTimelineBusy(true);
                                  try {
                                    const { index } = await compressTimelineRange(activeBook, {
                                      startChapter: s.startChapter,
                                      endChapter: s.endChapter,
                                      modelConfigId: activeModelId ?? null
                                    });
                                    setTimelineIndex(index);
                                  } catch (e: any) {
                                    setStatus(e?.message || String(e));
                                  } finally {
                                    setTimelineBusy(false);
                                  }
                                }}
                                title={s.why}
                              >
                                压缩 第 {s.startChapter}-{s.endChapter} 章
                                <span className="muted timelineSuggestionWhy">{s.why}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">暂无推荐。完成一次分析后会自动生成。</div>
                        )}
                      </div>

                      <div className="timelineSection">
                        <div className="auditPanelTitle">压缩章节</div>
                        <div className="timelineCompressRow">
                          <input
                            className="timelineInput"
                            value={timelineCompressStart}
                            onChange={(e) => setTimelineCompressStart(e.target.value)}
                            placeholder="起始章号"
                            inputMode="numeric"
                            disabled={busy || timelineBusy || !activeBook}
                          />
                          <span className="muted">到</span>
                          <input
                            className="timelineInput"
                            value={timelineCompressEnd}
                            onChange={(e) => setTimelineCompressEnd(e.target.value)}
                            placeholder="结束章号"
                            inputMode="numeric"
                            disabled={busy || timelineBusy || !activeBook}
                          />
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || timelineBusy || !activeBook}
                            onClick={async () => {
                              if (!activeBook) return;
                              const a = parseInt(timelineCompressStart, 10);
                              const b = parseInt(timelineCompressEnd, 10);
                              if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) {
                                setStatus("请输入有效的起止章号。");
                                return;
                              }
                              setTimelineBusy(true);
                              try {
                                const { index } = await compressTimelineRange(activeBook, {
                                  startChapter: a,
                                  endChapter: b,
                                  modelConfigId: activeModelId ?? null
                                });
                                setTimelineIndex(index);
                              } catch (e: any) {
                                setStatus(e?.message || String(e));
                              } finally {
                                setTimelineBusy(false);
                              }
                            }}
                          >
                            {timelineBusy ? "压缩中…" : "压缩"}
                          </button>
                        </div>
                        <div className="muted timelineHint">已压缩的区间可再次压缩（会覆盖更新）。</div>
                      </div>

                      <div className="timelineSection">
                        <div className="auditPanelTitle">区间压缩摘要</div>
                        {timelineIndex?.compressedRanges?.length ? (
                          <div className="timelineRangeList">
                            {timelineIndex.compressedRanges.map((r, i) => (
                              <div key={`${r.startChapter}-${r.endChapter}-${i}`} className="timelineRangeItem">
                                <div className="timelineRangeTop">
                                  <div className="timelineRangeTitle">
                                    第 {r.startChapter}-{r.endChapter} 章
                                  </div>
                                  <button
                                    type="button"
                                    className="btnSort"
                                    disabled={busy || timelineBusy || !activeBook}
                                    onClick={async () => {
                                      if (!activeBook) return;
                                      setTimelineBusy(true);
                                      try {
                                        const { index } = await compressTimelineRange(activeBook, {
                                          startChapter: r.startChapter,
                                          endChapter: r.endChapter,
                                          modelConfigId: activeModelId ?? null
                                        });
                                        setTimelineIndex(index);
                                      } catch (e: any) {
                                        setStatus(e?.message || String(e));
                                      } finally {
                                        setTimelineBusy(false);
                                      }
                                    }}
                                  >
                                    再次压缩
                                  </button>
                                </div>
                                <div className="timelineRangeSummary">{r.summary}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">暂无压缩区间。</div>
                        )}
                      </div>

                      <div className="timelineSection">
                        <div className="auditPanelTitle">关键事件</div>
                        {timelineIndex?.events?.length ? (
                          <div className="timelineEventList">
                            {timelineIndex.events
                              .filter((e) => (timelineShowDoneEvents ? true : e.status !== "done"))
                              .filter((e) =>
                                timelineShowDoneEvents
                                  ? true
                                  : !(timelineIndex.manual?.doneEventIds ?? []).includes(e.id)
                              )
                              .slice(0, 200)
                              .map((e) => {
                                const done = (timelineIndex.manual?.doneEventIds ?? []).includes(e.id) || e.status === "done";
                                return (
                                  <div
                                    key={e.id}
                                    className={`timelineEventItem ${done ? "done" : ""}`}
                                    data-event-id={e.id}
                                  >
                                    <div className="timelineEventTop">
                                      <div className="timelineEventTitle">
                                        第 {e.startChapter}
                                        {e.endChapter !== e.startChapter ? `-${e.endChapter}` : ""} 章 · {e.title}
                                      </div>
                                      <button
                                        type="button"
                                        className="btnSort"
                                        disabled={busy || timelineBusy || !activeBook}
                                        onClick={async () => {
                                          if (!activeBook) return;
                                          setTimelineBusy(true);
                                          try {
                                            const { index } = await markTimelineEvent(activeBook, {
                                              id: e.id,
                                              status: done ? "open" : "done"
                                            });
                                            setTimelineIndex(index);
                                          } catch (err: any) {
                                            setStatus(err?.message || String(err));
                                          } finally {
                                            setTimelineBusy(false);
                                          }
                                        }}
                                      >
                                        {done ? "取消完成" : "标记完成"}
                                      </button>
                                    </div>
                                    <div className="timelineEventSummary muted">{e.summary}</div>
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">事件将在后续版本中逐步补全（目前以每章摘要为主）。</div>
                        )}
                      </div>

                      <div className="timelineSection">
                        <div className="auditPanelTitle">每章摘要</div>
                        {timelineIndex?.chapters?.length ? (
                          <div className="timelineChapterList">
                            {[...timelineIndex.chapters]
                              .slice()
                              .reverse()
                              .slice(0, 80)
                              .map((c) => (
                                <div key={c.filename} className="timelineChapterItem">
                                  <div className="timelineChapterTop">
                                    <div className="timelineChapterTitle">
                                      第 {c.chapter} 章 · {c.title}
                                    </div>
                                    <div className="muted timelineChapterMeta">{c.filename}</div>
                                  </div>
                                  <div className="timelineChapterGist">{c.gistL1}</div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">还没有章节摘要。对任意章节完成一次分析后，这里会出现。</div>
                        )}
                      </div>
                    </div>
                  ) : rightTab === "orgs" ? (
                    <div className="placePanel">
                      {Array.isArray(auditOrgsIndex?.orgs) && (auditOrgsIndex.orgs as any[]).length ? (
                        (() => {
                          const all = (auditOrgsIndex.orgs as any[])
                            .map((o) => ({ ...o, name: String(o?.name || "").trim() }))
                            .filter((o) => o.name);
                          const hiddenSet = new Set(
                            Array.isArray(auditOrgsIndex?.hiddenNames)
                              ? (auditOrgsIndex.hiddenNames as any[]).map((x) => String(x))
                              : []
                          );
                          const visible = all.filter((o) => !hiddenSet.has(o.name));
                          return (
                            <>
                              <div className="placeList">
                                {visible.map((o) => (
                                  <div key={o.name} className="placeCard" data-org-name={o.name}>
                                    <div className="placeCardTop">
                                      <div className="placeName">{o.name}</div>
                                      <div className="row">
                                        <button
                                          type="button"
                                          className="btnSort"
                                          disabled={busy || !activeBook}
                                          onClick={() => openEditOrg(o)}
                                        >
                                          编辑
                                        </button>
                                        <button
                                          type="button"
                                          className="btnSort"
                                          disabled={busy || !activeBook}
                                          onClick={async () => {
                                            if (!activeBook) return;
                                            try {
                                              const { index } = await hideAuditOrg(activeBook, {
                                                name: o.name,
                                                hidden: true
                                              });
                                              setAuditOrgsIndex(index);
                                            } catch (e: any) {
                                              setStatus(e?.message || String(e));
                                            }
                                          }}
                                        >
                                          隐藏
                                        </button>
                                      </div>
                                    </div>
                                    <div className="placeBody">
                                      <div className="placeRow">
                                        <div className="placeLabel">简述</div>
                                        <div className="placeValue">{String(o.description || "").trim() || "—"}</div>
                                      </div>
                                      <div className="placeRow">
                                        <div className="placeLabel">动态</div>
                                        <div className="placeValue">{String(o.lastNote || "").trim() || "—"}</div>
                                      </div>
                                      <div className="placeMeta muted">
                                        {o.lastChapter ? `最近出现：第 ${o.lastChapter} 章` : ""}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="muted auditHiddenSummary">
                                {(() => {
                                  const hidden = all.filter((o) => hiddenSet.has(o.name));
                                  if (!hidden.length) return null;
                                  return (
                                    <button
                                      type="button"
                                      className="btnLinkMuted"
                                      disabled={busy || !activeBook}
                                      onClick={() => setHiddenOrgPanelOpen(true)}
                                    >
                                      已隐藏 {hidden.length}/{all.length} 个组织，点击查看
                                    </button>
                                  );
                                })()}
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <div className="muted auditPanelEmpty">暂无组织卡。完成一次分析后会自动收集组织。</div>
                      )}
                    </div>
                  ) : (
                    <div className="empty">该页签后续完善。</div>
                  )}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>

      {createBookModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setCreateBookModalOpen(false);
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-create-book-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-create-book-heading" className="modalHeading">
              新建书籍
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-book-title">
                书名<span className="modalReq">*</span>
              </label>
              <input
                id="modal-book-title"
                ref={createBookTitleInputRef}
                className="modalInput"
                value={modalNewTitle}
                onChange={(e) => setModalNewTitle(e.target.value)}
                placeholder="必填"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && modalNewTitle.trim() && !busy) {
                    e.preventDefault();
                    void submitCreateBookModal();
                  }
                }}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-book-synopsis">
                简介<span className="modalOptional">（选填）</span>
              </label>
              <textarea
                id="modal-book-synopsis"
                className="modalTextarea"
                value={modalNewSynopsis}
                onChange={(e) => setModalNewSynopsis(e.target.value)}
                placeholder="可留空，创建后再补充"
                disabled={busy}
                rows={4}
              />
            </div>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setCreateBookModalOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || !modalNewTitle.trim()}
                onClick={() => void submitCreateBookModal()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hiddenCharPanelOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setHiddenCharPanelOpen(false);
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-hidden-chars-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-hidden-chars-heading" className="modalHeading">
              已隐藏角色
            </h2>
            <div className="modalChapterGapBody">
              {(Array.isArray(auditCharactersIndex?.hiddenNames) ? (auditCharactersIndex.hiddenNames as any[]) : [])
                .map((x) => String(x).trim())
                .filter(Boolean)
                .map((name) => (
                  <div key={name} className="hiddenCharRow">
                    <div className="hiddenCharName">{name}</div>
                    <button
                      type="button"
                      className="btnModalSecondary"
                      disabled={busy || !activeBook}
                      onClick={async () => {
                        if (!activeBook) return;
                        try {
                          const { index } = await hideAuditCharacter(activeBook, { name, hidden: false });
                          setAuditCharactersIndex(index);
                        } catch (e: any) {
                          setStatus(e?.message || String(e));
                        }
                      }}
                    >
                      取消隐藏
                    </button>
                  </div>
                ))}
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy}
                onClick={() => setHiddenCharPanelOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hiddenPlacePanelOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setHiddenPlacePanelOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-hidden-places-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-hidden-places-heading" className="modalHeading">
              已隐藏地点
            </h2>
            <div className="modalChapterGapBody">
              {(Array.isArray(auditPlacesIndex?.hiddenNames) ? (auditPlacesIndex.hiddenNames as any[]) : [])
                .map((x) => String(x).trim())
                .filter(Boolean)
                .map((name) => (
                  <div key={name} className="hiddenCharRow">
                    <div className="hiddenCharName">{name}</div>
                    <button
                      type="button"
                      className="btnModalSecondary"
                      disabled={busy || !activeBook}
                      onClick={async () => {
                        if (!activeBook) return;
                        try {
                          const { index } = await hideAuditPlace(activeBook, { name, hidden: false });
                          setAuditPlacesIndex(index);
                        } catch (e: any) {
                          setStatus(e?.message || String(e));
                        }
                      }}
                    >
                      取消隐藏
                    </button>
                  </div>
                ))}
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy}
                onClick={() => setHiddenPlacePanelOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hiddenOrgPanelOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setHiddenOrgPanelOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-hidden-orgs-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-hidden-orgs-heading" className="modalHeading">
              已隐藏组织
            </h2>
            <div className="modalChapterGapBody">
              {(Array.isArray(auditOrgsIndex?.hiddenNames) ? (auditOrgsIndex.hiddenNames as any[]) : [])
                .map((x) => String(x).trim())
                .filter(Boolean)
                .map((name) => (
                  <div key={name} className="hiddenCharRow">
                    <div className="hiddenCharName">{name}</div>
                    <button
                      type="button"
                      className="btnModalSecondary"
                      disabled={busy || !activeBook}
                      onClick={async () => {
                        if (!activeBook) return;
                        try {
                          const { index } = await hideAuditOrg(activeBook, { name, hidden: false });
                          setAuditOrgsIndex(index);
                        } catch (e: any) {
                          setStatus(e?.message || String(e));
                        }
                      }}
                    >
                      取消隐藏
                    </button>
                  </div>
                ))}
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy}
                onClick={() => setHiddenOrgPanelOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOrgOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setEditOrgOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-org-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-edit-org-heading" className="modalHeading">
              编辑组织：{editOrgName}
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-org-desc">
                组织描述
              </label>
              <textarea
                id="modal-edit-org-desc"
                className="modalTextarea"
                value={editOrgDesc}
                onChange={(e) => setEditOrgDesc(e.target.value)}
                disabled={busy}
                rows={6}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-org-note">
                动态（简述）
              </label>
              <textarea
                id="modal-edit-org-note"
                className="modalTextarea"
                value={editOrgLastNote}
                onChange={(e) => setEditOrgLastNote(e.target.value)}
                disabled={busy}
                rows={6}
              />
            </div>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditOrgOpen(false)}>
                取消
              </button>
              <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditOrg()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {expandModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!expandBusy && !busy) setExpandModalOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-expand-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-expand-heading" className="modalHeading">
              快速扩写
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-expand-words">
                目标字数
              </label>
              <input
                id="modal-expand-words"
                className="modalInput"
                value={expandTargetWords}
                onChange={(e) => setExpandTargetWords(e.target.value)}
                disabled={busy || expandBusy}
                placeholder="例如 2500"
                inputMode="numeric"
              />
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                会自动把时间线“压缩摘要”投喂给模型作为已发生事件上下文。
              </div>
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-expand-extra">
                补充：当前发生的事情（可选）
              </label>
              <textarea
                id="modal-expand-extra"
                className="modalTextarea"
                value={expandExtraContext}
                onChange={(e) => setExpandExtraContext(e.target.value)}
                disabled={busy || expandBusy}
                rows={4}
                placeholder="例如：本章此刻主角刚到青石村晒谷场，准备……"
              />
            </div>
            {expandDraft.trim() ? (
              <div className="modalField">
                <label className="modalLabel">已生成扩写稿</label>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  扩写中会直接在编辑区以左右对照展示；你也可以点击“一键更换”替换正文。
                </div>
              </div>
            ) : null}
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || expandBusy}
                onClick={() => setExpandModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || expandBusy || !expandDraft.trim()}
                onClick={() => {
                  setChapterContent(expandDraft);
                  setExpandModalOpen(false);
                  setExpandDraft("");
                }}
                title="用扩写结果替换正文"
              >
                一键更换
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || expandBusy}
                onClick={() => {
                  const n = Math.floor(Number(expandTargetWords.trim()));
                  if (!Number.isFinite(n) || n < 200) {
                    setStatus("目标字数需为 >=200 的数字。");
                    return;
                  }
                  setExpandModalOpen(false);
                  setMobileReading(false);
                  setAuditReadModeOn(false);
                  setPolishModeOn(false);
                  setExpandModeOn(true);
                  void onExpandWithTargetWords(n, expandExtraContext);
                }}
              >
                {expandBusy ? "扩写中…" : "开始扩写"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editPlaceOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setEditPlaceOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-place-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-edit-place-heading" className="modalHeading">
              编辑地点：{editPlaceName}
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-place-desc">
                地点描述
              </label>
              <textarea
                id="modal-edit-place-desc"
                className="modalTextarea"
                value={editPlaceDesc}
                onChange={(e) => setEditPlaceDesc(e.target.value)}
                placeholder="如：青石村晒谷场，村民聚集处…"
                disabled={busy}
                rows={6}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-place-note">
                发生的事（简述）
              </label>
              <textarea
                id="modal-edit-place-note"
                className="modalTextarea"
                value={editPlaceLastNote}
                onChange={(e) => setEditPlaceLastNote(e.target.value)}
                placeholder="如：主角与反派第一次冲突…"
                disabled={busy}
                rows={6}
              />
            </div>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditPlaceOpen(false)}>
                取消
              </button>
              <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditPlace()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editCharOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setEditCharOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-char-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-edit-char-heading" className="modalHeading">
              编辑角色：{editCharName}
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-char-role">
                身份
              </label>
              <input
                id="modal-edit-char-role"
                className="modalInput"
                value={editCharRole}
                onChange={(e) => setEditCharRole(e.target.value)}
                placeholder="如：主角/配角/反派…"
                disabled={busy}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-char-tags">
                标签<span className="modalOptional">（逗号分隔）</span>
              </label>
              <input
                id="modal-edit-char-tags"
                className="modalInput"
                value={editCharTags}
                onChange={(e) => setEditCharTags(e.target.value)}
                placeholder="盟友, 敌对, 神秘…"
                disabled={busy}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-char-personality">
                性格分析
              </label>
              <input
                id="modal-edit-char-personality"
                className="modalInput"
                value={editCharPersonality}
                onChange={(e) => setEditCharPersonality(e.target.value)}
                placeholder="性格、动机、弱点、行为模式…"
                disabled={busy}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-edit-char-state">
                state<span className="modalOptional">（JSON，可选）</span>
              </label>
              <textarea
                id="modal-edit-char-state"
                className="modalTextarea"
                value={editCharStateJson}
                onChange={(e) => setEditCharStateJson(e.target.value)}
                disabled={busy}
                rows={8}
              />
            </div>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditCharOpen(false)}>
                取消
              </button>
              <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditCharacter()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chapterGapModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) closeChapterGapModal();
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-chapter-gap-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-chapter-gap-heading" className="modalHeading">
              检测到章节序号空缺
            </h2>
            <p className="modalChapterGapMuted">
              {(() => {
                const m = books.find((bk) => bk.slug === chapterGapModalBookSlug);
                return m ? `《${m.title}》` : chapterGapModalBookSlug;
              })()}
            </p>
            <p className="modalChapterGapBody">
              当前空缺：{formatMissingChapterList(chapterGapModalIndexes)}。填写章节标题后，选择补齐最先空缺或跳过空缺接续在最大序号之后。
            </p>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-chapter-gap-title">
                章节标题<span className="modalReq">*</span>
              </label>
              <input
                id="modal-chapter-gap-title"
                ref={chapterGapTitleInputRef}
                className="modalInput"
                value={chapterGapModalDraftTitle}
                onChange={(e) => setChapterGapModalDraftTitle(e.target.value)}
                placeholder="将写入文件名中的标题部分"
                disabled={busy}
              />
            </div>
            <div className="modalActions modalActionsWrap">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => closeChapterGapModal()}>
                取消
              </button>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !chapterGapModalDraftTitle.trim()}
                onClick={() => void confirmChapterGapSkip()}
              >
                跳过空缺
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || chapterGapModalIndexes.length === 0 || !chapterGapModalDraftTitle.trim()}
                onClick={() => void confirmChapterGapFill()}
              >
                补齐第 {chapterGapModalIndexes[0]} 章
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteBookModalOpen && deleteBookTarget ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) closeDeleteBookModal();
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-book-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-delete-book-heading" className="modalHeading">
              废弃书籍
            </h2>
            <p className="modalChapterGapBody">
              确定废弃《{deleteBookTarget.title}》吗？不会删除任何本地内容，但书架将不再展示该书。
            </p>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => closeDeleteBookModal()}>
                取消
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy}
                onClick={() => void confirmDeleteBook()}
              >
                确认废弃
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createCharacterModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setCreateCharacterModalOpen(false);
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-create-character-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-create-character-heading" className="modalHeading">
              新增角色
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-character-name">
                角色名<span className="modalReq">*</span>
              </label>
              <input
                id="modal-character-name"
                className="modalInput"
                value={modalCharacterName}
                onChange={(e) => setModalCharacterName(e.target.value)}
                placeholder="必填"
                disabled={busy || !activeBook}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-character-role">
                身份
              </label>
              <select
                id="modal-character-role"
                className="select"
                value={modalCharacterRole}
                onChange={(e) => setModalCharacterRole(e.target.value as CharacterRole)}
                disabled={busy || !activeBook}
              >
                {CHARACTER_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="modalField">
              <div className="modalLabel">标签</div>
              <div className="chips">
                {CHARACTER_TAG_OPTIONS.map((t) => {
                  const active = modalCharacterTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`chip ${active ? "active" : ""}`}
                      onClick={() =>
                        setModalCharacterTags((prev) =>
                          active ? prev.filter((x) => x !== t) : [...prev, t]
                        )
                      }
                      disabled={busy || !activeBook}
                      aria-pressed={active}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  value={modalCharacterTagDraft}
                  onChange={(e) => setModalCharacterTagDraft(e.target.value)}
                  placeholder="输入自定义标签，回车添加"
                  disabled={busy || !activeBook}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = modalCharacterTagDraft.trim();
                    if (!t) return;
                    setModalCharacterTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                    setModalCharacterTagDraft("");
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !activeBook || !modalCharacterTagDraft.trim()}
                  onClick={() => {
                    const t = modalCharacterTagDraft.trim();
                    if (!t) return;
                    setModalCharacterTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                    setModalCharacterTagDraft("");
                  }}
                >
                  添加标签
                </button>
              </div>
              {modalCharacterTags.length ? (
                <div className="chips" style={{ marginTop: 10 }}>
                  {modalCharacterTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="chip active"
                      onClick={() => setModalCharacterTags((prev) => prev.filter((x) => x !== t))}
                      disabled={busy || !activeBook}
                      title="点击移除"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy}
                onClick={() => setCreateCharacterModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || !activeBook || !modalCharacterName.trim()}
                onClick={() => void onCreateCharacter()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

