import type { IdeaItem } from "../api";

export type InspGenSlice = {
  previewItems: IdeaItem[];
  savedIdSet: Record<string, boolean>;
  expanded: Record<string, boolean>;
  editingId: string | null;
  editTitle: string;
  editContent: string;
  freeText: string;
  useMemory: boolean;
  count: number;
  /** 道具生成:持有者角色名;空字符串表示无主/待定 */
  itemOwnerCharacterName: string;
};

export function emptyInspGenSlice(): InspGenSlice {
  return {
    previewItems: [],
    savedIdSet: {},
    expanded: {},
    editingId: null,
    editTitle: "",
    editContent: "",
    freeText: "",
    useMemory: true,
    count: 3,
    itemOwnerCharacterName: ""
  };
}

/** 灵感库 · 地点生成落库的 JSON content 结构 */
export type InspirationPlaceContent = {
  atmosphere?: string;
  layout?: string;
  functions?: string;
  hazards?: string;
  hidden_hooks?: string;
  sensory_fingerprints?: { sound?: string; visual?: string; smell?: string };
  relationship_hooks?: Array<{ target?: string; nature?: string; description?: string }>;
};

export function parseInspirationPlaceContent(raw: string): InspirationPlaceContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = [
      "atmosphere",
      "layout",
      "functions",
      "hazards",
      "hidden_hooks",
      "sensory_fingerprints",
      "relationship_hooks"
    ];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationPlaceContent;
  } catch {
    return null;
  }
}

export function inspirationPlaceCollapsedBlurb(data: InspirationPlaceContent, title: string): string {
  const a = String(data.atmosphere || "").trim();
  if (a) return a.length > 140 ? `${a.slice(0, 140)}...` : a;
  const l = String(data.layout || "").trim();
  if (l) return l.length > 140 ? `${l.slice(0, 140)}...` : l;
  return title ? `「${title}」` : "地点卡";
}

/** 灵感库 · 道具生成落库的 JSON content 结构 */
export type InspirationItemContent = {
  appearance?: string;
  ownership_status?: string;
  functions?: string;
  limitations?: string;
  origin?: string;
  narrative_hooks?: string;
  relationship_hooks?: Array<{ target?: string; nature?: string; description?: string }>;
};

export function parseInspirationItemContent(raw: string): InspirationItemContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = [
      "appearance",
      "ownership_status",
      "functions",
      "limitations",
      "origin",
      "narrative_hooks",
      "relationship_hooks"
    ];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationItemContent;
  } catch {
    return null;
  }
}

export function inspirationItemCollapsedBlurb(data: InspirationItemContent, title: string): string {
  const a = String(data.appearance || "").trim();
  if (a) return a.length > 140 ? `${a.slice(0, 140)}...` : a;
  const f = String(data.functions || "").trim();
  if (f) return f.length > 140 ? `${f.slice(0, 140)}...` : f;
  return title ? `「${title}」` : "道具卡";
}

/** 灵感库 · 组织/势力卡落库的 JSON content 结构 */
export type InspirationOrgContent = {
  doctrine?: string;
  hidden_agenda?: string;
  hierarchy?: string;
  power_base?: string;
  internal_factions?: string;
  entry_exit_cost?: string;
  relationship_hooks?: Array<{ target?: string; nature?: string; description?: string }>;
};

export function parseInspirationOrgContent(raw: string): InspirationOrgContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = [
      "doctrine",
      "hidden_agenda",
      "hierarchy",
      "power_base",
      "internal_factions",
      "entry_exit_cost",
      "relationship_hooks"
    ];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationOrgContent;
  } catch {
    return null;
  }
}

export function inspirationOrgCollapsedBlurb(data: InspirationOrgContent, title: string): string {
  const d = String(data.doctrine || "").trim();
  if (d) return d.length > 140 ? `${d.slice(0, 140)}...` : d;
  const h = String(data.hidden_agenda || "").trim();
  if (h) return h.length > 140 ? `${h.slice(0, 140)}...` : h;
  const p = String(data.power_base || "").trim();
  if (p) return p.length > 140 ? `${p.slice(0, 140)}...` : p;
  return title ? `「${title}」` : "组织卡";
}

/** 灵感库 · 事件卡 */
export type InspirationEventContent = {
  trigger?: string;
  description?: string;
  impact?: string;
  dilemma?: string;
  karma_delta?: string;
  relationship_hooks?: Array<{ target?: string; change?: string }>;
};

export function parseInspirationEventContent(raw: string): InspirationEventContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = ["trigger", "description", "impact", "dilemma", "karma_delta", "relationship_hooks"];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationEventContent;
  } catch {
    return null;
  }
}

export function inspirationEventCollapsedBlurb(data: InspirationEventContent, title: string): string {
  const d = String(data.description || "").trim();
  if (d) return d.length > 140 ? `${d.slice(0, 140)}...` : d;
  const tr = String(data.trigger || "").trim();
  if (tr) return tr.length > 140 ? `${tr.slice(0, 140)}...` : tr;
  return title ? `「${title}」` : "事件卡";
}

/** 灵感库 · 秘闻卡 */
export type InspirationLoreContent = {
  surface_rumor?: string;
  hidden_truth?: string;
  evidence_trace?: string;
  danger_level?: string;
  narrative_value?: string;
};

export function parseInspirationLoreContent(raw: string): InspirationLoreContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = ["surface_rumor", "hidden_truth", "evidence_trace", "danger_level", "narrative_value"];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationLoreContent;
  } catch {
    return null;
  }
}

export function inspirationLoreCollapsedBlurb(data: InspirationLoreContent, title: string): string {
  const s = String(data.surface_rumor || "").trim();
  if (s) return s.length > 140 ? `${s.slice(0, 140)}...` : s;
  const h = String(data.hidden_truth || "").trim();
  if (h) return h.length > 140 ? `${h.slice(0, 140)}...` : h;
  return title ? `「${title}」` : "秘闻卡";
}

/** 灵感库 · 功法卡 */
export type InspirationTechniqueContent = {
  logic_flow?: string;
  effect?: string;
  backlash?: string;
  requirement?: string;
  lore_origin?: string;
};

export function parseInspirationTechniqueContent(raw: string): InspirationTechniqueContent | null {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const keys = ["logic_flow", "effect", "backlash", "requirement", "lore_origin"];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
    return o as InspirationTechniqueContent;
  } catch {
    return null;
  }
}

export function inspirationTechniqueCollapsedBlurb(data: InspirationTechniqueContent, title: string): string {
  const e = String(data.effect || "").trim();
  if (e) return e.length > 140 ? `${e.slice(0, 140)}...` : e;
  const l = String(data.logic_flow || "").trim();
  if (l) return l.length > 140 ? `${l.slice(0, 140)}...` : l;
  return title ? `「${title}」` : "功法卡";
}
