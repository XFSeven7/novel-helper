import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ChapterMeta } from "./fsStore.js";
import { normalizeStageChatTurns } from "./outlineStageChat/normalize.js";
import type { StageChatTurn } from "./outlineStageChat/types.js";

export type { StageChatTurn } from "./outlineStageChat/types.js";

export type OutlineStageNode = {
  id: string;
  label: string;
  note?: string;
  children?: OutlineStageNode[];
  chapterRange?: string;
  chatTurns?: StageChatTurn[];
};

export type BookOutline = {
  logline?: string;
  synopsis?: {
    setup?: string;
    development?: string;
    twist?: string;
    climax?: string;
    ending?: string;
  };
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;
  mainlineStages?: OutlineStageNode[];
};

export type VolumeOutline = {
  id: string;
  title: string;
  order: number;
  synopsis?: string;
  chapterFilenames: string[];
};

export type ChapterPlan = {
  updatedAt?: string;
  core?: string;
  scenes?: string;
  pov?: string;
  time?: string;
  beats?: string[];
  foreshadowPlant?: string[];
  foreshadowPayoff?: string[];
  hook?: string;
  coolPoint?: string;
  rhythmNote?: string;
};

export type OutlineIndex = {
  version: 1;
  updatedAt: string;
  book: BookOutline;
  volumes: VolumeOutline[];
  ungroupedFilenames: string[];
  chapterPlans: Record<string, ChapterPlan>;
};

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function outlineIndexPath(dataDir: string, novelSlug: string) {
  return path.join(dataDir, novelSlug, "outline.json");
}

function emptyBookOutline(): BookOutline {
  return {};
}

export function createDefaultOutlineIndex(chapters: ChapterMeta[]): OutlineIndex {
  const filenames = chapters.map((c) => c.filename);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    book: emptyBookOutline(),
    volumes: [],
    ungroupedFilenames: [...filenames],
    chapterPlans: {}
  };
}

function normalizeChapterPlan(raw: any): ChapterPlan {
  const beats = Array.isArray(raw?.beats) ? raw.beats.map((x: any) => String(x || "").trim()).filter(Boolean) : undefined;
  const plant = Array.isArray(raw?.foreshadowPlant)
    ? raw.foreshadowPlant.map((x: any) => String(x || "").trim()).filter(Boolean)
    : undefined;
  const payoff = Array.isArray(raw?.foreshadowPayoff)
    ? raw.foreshadowPayoff.map((x: any) => String(x || "").trim()).filter(Boolean)
    : undefined;
  return {
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : undefined,
    core: typeof raw?.core === "string" ? raw.core : undefined,
    scenes: typeof raw?.scenes === "string" ? raw.scenes : undefined,
    pov: typeof raw?.pov === "string" ? raw.pov : undefined,
    time: typeof raw?.time === "string" ? raw.time : undefined,
    beats: beats?.length ? beats : undefined,
    foreshadowPlant: plant?.length ? plant : undefined,
    foreshadowPayoff: payoff?.length ? payoff : undefined,
    hook: typeof raw?.hook === "string" ? raw.hook : undefined,
    coolPoint: typeof raw?.coolPoint === "string" ? raw.coolPoint : undefined,
    rhythmNote: typeof raw?.rhythmNote === "string" ? raw.rhythmNote : undefined
  };
}

export function synthesizeVolumeSynopsis(
  chapterFilenames: string[],
  plans: Record<string, ChapterPlan>
): string {
  const cores = chapterFilenames
    .map((f) => plans[f]?.core?.trim())
    .filter((x): x is string => Boolean(x));
  if (!cores.length) return "";
  if (cores.length === 1) return cores[0]!;
  const head = cores.slice(0, 2).join("\n\n");
  if (cores.length <= 2) return head;
  return `${head}\n\n（本卷共 ${cores.length} 章，由章纲核心归纳）`;
}

export function matchVolumeToCurrent(incoming: VolumeOutline, currents: VolumeOutline[]): VolumeOutline | null {
  const exact = currents.find((v) => v.id === incoming.id);
  if (exact) return exact;
  const incomingSet = new Set(incoming.chapterFilenames || []);
  let best: VolumeOutline | null = null;
  let bestScore = 0;
  for (const v of currents) {
    const score = v.chapterFilenames.filter((f) => incomingSet.has(f)).length;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  if (best) return best;
  if (currents.length === 1) return currents[0]!;
  return null;
}

function normalizeVolume(raw: any, fallbackOrder: number): VolumeOutline | null {
  const id = String(raw?.id || "").trim();
  const title = String(raw?.title || "").trim() || `第${fallbackOrder}卷`;
  if (!id) return null;
  const chapterFilenames = Array.isArray(raw?.chapterFilenames)
    ? raw.chapterFilenames.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];
  return {
    id,
    title,
    order: Number.isFinite(raw?.order) ? Number(raw.order) : fallbackOrder,
    synopsis: typeof raw?.synopsis === "string" ? raw.synopsis : undefined,
    chapterFilenames
  };
}

function normalizeStageNode(raw: any, fallbackIndex: number): OutlineStageNode | null {
  const id = String(raw?.id || "").trim() || `stage-${crypto.randomUUID()}`;
  const label = typeof raw?.label === "string" ? raw.label : "";
  const note = typeof raw?.note === "string" ? raw.note : undefined;
  const chapterRange = typeof raw?.chapterRange === "string" ? raw.chapterRange : undefined;
  const childrenRaw = Array.isArray(raw?.children) ? raw.children : [];
  const children = childrenRaw
    .map((c: any, i: number) => normalizeStageNode(c, i))
    .filter((c: OutlineStageNode | null): c is OutlineStageNode => c !== null);
  const chatTurns = normalizeStageChatTurns(raw?.chatTurns);
  return {
    id,
    label,
    note,
    chapterRange,
    children,
    ...(chatTurns ? { chatTurns } : {})
  };
}

function normalizeMainlineStages(raw: unknown): OutlineStageNode[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stages = raw
    .map((s: any, i: number) => normalizeStageNode(s, i))
    .filter((s: OutlineStageNode | null): s is OutlineStageNode => s !== null);
  return stages.length ? stages : undefined;
}

export function normalizeOutlineIndex(parsed: any): OutlineIndex {
  const bookRaw = parsed?.book && typeof parsed.book === "object" ? parsed.book : {};
  const synopsisRaw = bookRaw?.synopsis && typeof bookRaw.synopsis === "object" ? bookRaw.synopsis : {};
  const mainlineStages = normalizeMainlineStages(bookRaw?.mainlineStages);

  const volumes: VolumeOutline[] = [];
  if (Array.isArray(parsed?.volumes)) {
    parsed.volumes.forEach((v: any, i: number) => {
      const vol = normalizeVolume(v, i + 1);
      if (vol) volumes.push(vol);
    });
  }
  volumes.sort((a, b) => a.order - b.order);

  const ungroupedFilenames = Array.isArray(parsed?.ungroupedFilenames)
    ? parsed.ungroupedFilenames.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];

  const chapterPlans: Record<string, ChapterPlan> = {};
  if (parsed?.chapterPlans && typeof parsed.chapterPlans === "object") {
    for (const [k, v] of Object.entries(parsed.chapterPlans)) {
      const key = String(k || "").trim();
      if (!key) continue;
      chapterPlans[key] = normalizeChapterPlan(v);
    }
  }

  return {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    book: {
      logline: typeof bookRaw?.logline === "string" ? bookRaw.logline : undefined,
      synopsis: {
        setup: typeof synopsisRaw?.setup === "string" ? synopsisRaw.setup : undefined,
        development: typeof synopsisRaw?.development === "string" ? synopsisRaw.development : undefined,
        twist: typeof synopsisRaw?.twist === "string" ? synopsisRaw.twist : undefined,
        climax: typeof synopsisRaw?.climax === "string" ? synopsisRaw.climax : undefined,
        ending: typeof synopsisRaw?.ending === "string" ? synopsisRaw.ending : undefined
      },
      targetWords: Number.isFinite(bookRaw?.targetWords) ? Number(bookRaw.targetWords) : undefined,
      targetChapters: Number.isFinite(bookRaw?.targetChapters) ? Number(bookRaw.targetChapters) : undefined,
      structureFramework: typeof bookRaw?.structureFramework === "string" ? bookRaw.structureFramework : undefined,
      mainlineStages: mainlineStages?.length ? mainlineStages : undefined
    },
    volumes,
    ungroupedFilenames,
    chapterPlans
  };
}

export async function readOutlineIndex(dataDir: string, novelSlug: string): Promise<OutlineIndex | null> {
  const p = outlineIndexPath(dataDir, novelSlug);
  if (!(await exists(p))) return null;
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as any;
  return normalizeOutlineIndex(parsed);
}

export async function writeOutlineIndex(dataDir: string, novelSlug: string, idx: OutlineIndex) {
  const novelDir = path.join(dataDir, novelSlug);
  await fs.mkdir(novelDir, { recursive: true });
  const next: OutlineIndex = {
    ...idx,
    version: 1,
    updatedAt: new Date().toISOString()
  };
  const p = outlineIndexPath(dataDir, novelSlug);
  await fs.writeFile(p, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function reconcileOutlineWithChapters(idx: OutlineIndex, chapterFilenames: string[]): OutlineIndex {
  const valid = new Set(chapterFilenames);
  const inVolumes = new Set<string>();

  const volumes = idx.volumes.map((v) => {
    const chapterFilenamesClean = v.chapterFilenames.filter((f) => valid.has(f));
    chapterFilenamesClean.forEach((f) => inVolumes.add(f));
    return { ...v, chapterFilenames: chapterFilenamesClean };
  });

  let ungrouped = idx.ungroupedFilenames.filter((f) => valid.has(f) && !inVolumes.has(f));
  for (const f of chapterFilenames) {
    if (!inVolumes.has(f) && !ungrouped.includes(f)) ungrouped.push(f);
  }
  ungrouped = [...new Set(ungrouped)];

  const chapterPlans: Record<string, ChapterPlan> = {};
  for (const [k, plan] of Object.entries(idx.chapterPlans || {})) {
    if (valid.has(k)) chapterPlans[k] = plan;
  }

  return {
    ...idx,
    volumes,
    ungroupedFilenames: ungrouped,
    chapterPlans
  };
}

export async function ensureOutlineIndex(
  dataDir: string,
  novelSlug: string,
  chapters: ChapterMeta[]
): Promise<OutlineIndex> {
  const filenames = chapters.map((c) => c.filename);
  const existing = await readOutlineIndex(dataDir, novelSlug);
  if (!existing) {
    const created = createDefaultOutlineIndex(chapters);
    return writeOutlineIndex(dataDir, novelSlug, created);
  }
  const reconciled = reconcileOutlineWithChapters(existing, filenames);
  if (JSON.stringify(reconciled) !== JSON.stringify(existing)) {
    return writeOutlineIndex(dataDir, novelSlug, reconciled);
  }
  return existing;
}

export function validateOutlineAgainstChapters(idx: OutlineIndex, chapterFilenames: string[]): string[] {
  const valid = new Set(chapterFilenames);
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const v of idx.volumes) {
    for (const f of v.chapterFilenames) {
      if (!valid.has(f)) warnings.push(`分卷「${v.title}」含不存在章节: ${f}`);
      if (seen.has(f)) warnings.push(`章节重复归属: ${f}`);
      seen.add(f);
    }
  }
  for (const f of idx.ungroupedFilenames) {
    if (!valid.has(f)) warnings.push(`未分卷含不存在章节: ${f}`);
    if (seen.has(f)) warnings.push(`章节重复归属: ${f}`);
    seen.add(f);
  }
  for (const k of Object.keys(idx.chapterPlans)) {
    if (!valid.has(k)) warnings.push(`章纲引用不存在章节: ${k}`);
  }
  return warnings;
}

function isChapterPlanEmpty(plan: ChapterPlan | undefined): boolean {
  if (!plan) return true;
  return !(
    plan.core ||
    plan.scenes ||
    plan.pov ||
    plan.time ||
    (plan.beats && plan.beats.length) ||
    (plan.foreshadowPlant && plan.foreshadowPlant.length) ||
    (plan.foreshadowPayoff && plan.foreshadowPayoff.length) ||
    plan.hook ||
    plan.coolPoint ||
    plan.rhythmNote
  );
}

function mergeChapterPlan(
  current: ChapterPlan | undefined,
  incoming: ChapterPlan,
  overwrite: boolean
): ChapterPlan {
  if (overwrite || isChapterPlanEmpty(current)) {
    return { ...incoming, updatedAt: new Date().toISOString() };
  }
  const base = current || {};
  return {
    updatedAt: new Date().toISOString(),
    core: base.core || incoming.core,
    scenes: base.scenes || incoming.scenes,
    pov: base.pov || incoming.pov,
    time: base.time || incoming.time,
    beats: base.beats?.length ? base.beats : incoming.beats,
    foreshadowPlant: base.foreshadowPlant?.length ? base.foreshadowPlant : incoming.foreshadowPlant,
    foreshadowPayoff: base.foreshadowPayoff?.length ? base.foreshadowPayoff : incoming.foreshadowPayoff,
    hook: base.hook || incoming.hook,
    coolPoint: base.coolPoint || incoming.coolPoint,
    rhythmNote: base.rhythmNote || incoming.rhythmNote
  };
}

function mergeBookOutline(current: BookOutline, incoming: Partial<BookOutline>, overwrite: boolean): BookOutline {
  const pick = <T>(cur: T | undefined, inc: T | undefined) => (overwrite ? inc ?? cur : cur ?? inc);
  const synCur = current.synopsis || {};
  const synInc = incoming.synopsis || {};
  return {
    logline: pick(current.logline, incoming.logline),
    synopsis: {
      setup: pick(synCur.setup, synInc.setup),
      development: pick(synCur.development, synInc.development),
      twist: pick(synCur.twist, synInc.twist),
      climax: pick(synCur.climax, synInc.climax),
      ending: pick(synCur.ending, synInc.ending)
    },
    targetWords: pick(current.targetWords, incoming.targetWords),
    targetChapters: pick(current.targetChapters, incoming.targetChapters),
    structureFramework: pick(current.structureFramework, incoming.structureFramework),
    mainlineStages: incoming.mainlineStages?.length
      ? incoming.mainlineStages
      : current.mainlineStages
  };
}

export type OutlineAiPreviewMode =
  | "snowflake"
  | "fromChapters"
  | "refineChapterPlan"
  | "volumeChapterPlans"
  | "foreshadowAudit";

/** 补全 AI 预览中的分卷与卷摘要，便于应用时写入 outline.json */
export function enrichOutlineAiPreview(
  current: OutlineIndex,
  preview: Partial<OutlineIndex>,
  mode: OutlineAiPreviewMode,
  ctx?: { volumeId?: string }
): Partial<OutlineIndex> {
  const plans = preview.chapterPlans || {};
  const hasPlans = Object.keys(plans).length > 0;
  const next: Partial<OutlineIndex> = { ...preview };

  if (mode === "volumeChapterPlans" && ctx?.volumeId) {
    const vol = current.volumes.find((v) => v.id === ctx.volumeId);
    if (vol && hasPlans) {
      const synopsis = synthesizeVolumeSynopsis(vol.chapterFilenames, plans);
      if (synopsis) {
        next.volumes = [{ ...vol, synopsis: synopsis || vol.synopsis }];
      }
    }
    return next;
  }

  if (mode !== "fromChapters" && mode !== "snowflake") return next;
  if (!hasPlans && !preview.volumes?.length && !preview.book) return next;

  const incomingVolumes = Array.isArray(preview.volumes) ? preview.volumes : [];

  if (incomingVolumes.length) {
    const mergedVolumes: VolumeOutline[] = [];
    incomingVolumes.forEach((pv, i) => {
      const raw = normalizeVolume(pv, i + 1);
      if (!raw) return;
      const matched = matchVolumeToCurrent(raw, current.volumes);
      const id = matched?.id ?? raw.id;
      const existing = current.volumes.find((v) => v.id === id) ?? matched;
      const filenames =
        raw.chapterFilenames.length > 0
          ? raw.chapterFilenames
          : existing?.chapterFilenames || raw.chapterFilenames;
      const synopsis =
        raw.synopsis?.trim() ||
        synthesizeVolumeSynopsis(filenames, plans) ||
        existing?.synopsis ||
        "";
      mergedVolumes.push({
        id,
        title: raw.title || existing?.title || `第${i + 1}卷`,
        order: raw.order ?? existing?.order ?? i + 1,
        synopsis: synopsis || undefined,
        chapterFilenames: filenames
      });
    });
    next.volumes = mergedVolumes;
    return next;
  }

  if (hasPlans && current.volumes.length) {
    next.volumes = current.volumes.map((v) => {
      const filenames = v.chapterFilenames.length
        ? v.chapterFilenames
        : current.ungroupedFilenames.filter((f) => plans[f]);
      const synopsis = synthesizeVolumeSynopsis(filenames, plans) || v.synopsis;
      return { ...v, synopsis: synopsis || v.synopsis };
    });
    return next;
  }

  if (hasPlans) {
    const filenames = Object.keys(plans).sort();
    const existing = current.volumes[0];
    next.volumes = [
      {
        id: existing?.id || "vol-main",
        title: existing?.title || "正文",
        order: 1,
        synopsis: synthesizeVolumeSynopsis(filenames, plans),
        chapterFilenames: filenames
      }
    ];
    next.ungroupedFilenames = [];
  }

  return next;
}

export function mergeOutlinePreview(
  current: OutlineIndex,
  preview: Partial<OutlineIndex>,
  opts: { overwrite: boolean; validFilenames: Set<string> }
): { merged: OutlineIndex; warnings: string[] } {
  const warnings: string[] = [];
  const { overwrite, validFilenames } = opts;

  let book = current.book;
  if (preview.book) {
    book = mergeBookOutline(current.book, preview.book, overwrite);
  }

  const volumeById = new Map(current.volumes.map((v) => [v.id, v]));
  if (Array.isArray(preview.volumes)) {
    for (const pv of preview.volumes) {
      const vol = normalizeVolume(pv, volumeById.size + 1);
      if (!vol) continue;
      const cleanFilenames = vol.chapterFilenames.filter((f) => {
        if (!validFilenames.has(f)) {
          warnings.push(`已忽略不存在章节: ${f}`);
          return false;
        }
        return true;
      });
      const matched = matchVolumeToCurrent(vol, [...volumeById.values()]);
      const targetId = matched?.id ?? vol.id;
      const existing = volumeById.get(targetId);
      const incomingSynopsis = vol.synopsis?.trim();
      if (existing) {
        volumeById.set(targetId, {
          ...existing,
          title: overwrite ? vol.title : existing.title || vol.title,
          order: vol.order ?? existing.order,
          synopsis: overwrite
            ? incomingSynopsis || existing.synopsis
            : existing.synopsis?.trim() || incomingSynopsis || existing.synopsis,
          chapterFilenames: overwrite
            ? cleanFilenames.length
              ? cleanFilenames
              : existing.chapterFilenames
            : [...new Set([...existing.chapterFilenames, ...cleanFilenames])]
        });
      } else {
        volumeById.set(targetId, { ...vol, id: targetId, chapterFilenames: cleanFilenames });
      }
    }
  }

  const volumes = [...volumeById.values()].sort((a, b) => a.order - b.order);
  const inVolumes = new Set(volumes.flatMap((v) => v.chapterFilenames));

  let ungroupedFilenames = current.ungroupedFilenames;
  if (Array.isArray(preview.ungroupedFilenames)) {
    ungroupedFilenames = preview.ungroupedFilenames.filter((f) => validFilenames.has(f) && !inVolumes.has(f));
  } else if (preview.volumes?.length) {
    ungroupedFilenames = ungroupedFilenames.filter((f) => !inVolumes.has(f));
  }

  const chapterPlans = { ...current.chapterPlans };
  if (preview.chapterPlans) {
    for (const [filename, plan] of Object.entries(preview.chapterPlans)) {
      if (!validFilenames.has(filename)) {
        warnings.push(`已忽略不存在章节的章纲: ${filename}`);
        continue;
      }
      chapterPlans[filename] = mergeChapterPlan(chapterPlans[filename], normalizeChapterPlan(plan), overwrite);
    }
  }

  const merged: OutlineIndex = {
    ...current,
    book,
    volumes,
    ungroupedFilenames,
    chapterPlans
  };

  return { merged: reconcileOutlineWithChapters(merged, [...validFilenames]), warnings };
}

export function stripInvalidFilenamesFromPreview(
  preview: Partial<OutlineIndex>,
  validFilenames: Set<string>
): { preview: Partial<OutlineIndex>; warnings: string[] } {
  const warnings: string[] = [];
  const volumes = preview.volumes?.map((v) => ({
    ...v,
    chapterFilenames: (v.chapterFilenames || []).filter((f) => {
      if (!validFilenames.has(f)) {
        warnings.push(`已忽略不存在章节: ${f}`);
        return false;
      }
      return true;
    })
  }));
  const chapterPlans: Record<string, ChapterPlan> = {};
  if (preview.chapterPlans) {
    for (const [k, p] of Object.entries(preview.chapterPlans)) {
      if (validFilenames.has(k)) chapterPlans[k] = p;
      else warnings.push(`已忽略不存在章节的章纲: ${k}`);
    }
  }
  return {
    preview: { ...preview, volumes, chapterPlans },
    warnings
  };
}
