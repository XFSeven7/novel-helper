import fs from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
/** 与 index.ts 内 ModelConfig 兼容，避免循环依赖 */
export type OutlineAiModelConfig = {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
};
import {
  listChapters,
  readChapter,
  readStoryFile,
  readTimelineIndex,
  readAuditForeshadowsIndex,
  type ChapterMeta
} from "./fsStore.js";
import {
  buildOutlineSnowflakePrompt,
  buildOutlineFromChaptersPrompt,
  buildOutlineRefineChapterPlanPrompt,
  buildOutlineVolumeChapterPlansPrompt,
  buildOutlineForeshadowAuditPrompt,
  truncateForPrompt
} from "./prompts/index.js";
import type { OutlineIndex } from "./outlineStore.js";
import {
  enrichOutlineAiPreview,
  stripInvalidFilenamesFromPreview,
  type OutlineAiPreviewMode
} from "./outlineStore.js";

export type OutlineAiMode =
  | "snowflake"
  | "fromChapters"
  | "refineChapterPlan"
  | "volumeChapterPlans"
  | "foreshadowAudit";

async function readNovelSynopsis(dataDir: string, slug: string): Promise<string> {
  const metaPath = path.join(dataDir, slug, "meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    return String(parsed?.synopsis || "").trim();
  } catch {
    return "";
  }
}

async function readWorldExcerpt(dataDir: string, slug: string, max = 4000): Promise<string> {
  try {
    const raw = await readStoryFile(dataDir, slug, "story/world.md");
    return truncateForPrompt(String(raw || ""), max);
  } catch {
    return "";
  }
}

function chapterExcerpt(content: string, max = 800): string {
  const body = String(content || "")
    .replace(/^#\s+.+\n+/m, "")
    .trim();
  return truncateForPrompt(body, max);
}

async function loadChapterExcerpts(
  dataDir: string,
  slug: string,
  chapters: ChapterMeta[],
  filenames?: string[]
): Promise<Array<{ filename: string; id: string; title: string; excerpt: string }>> {
  const set = filenames ? new Set(filenames) : null;
  const list = set ? chapters.filter((c) => set.has(c.filename)) : chapters;
  const out: Array<{ filename: string; id: string; title: string; excerpt: string }> = [];
  for (const c of list) {
    try {
      const raw = await readChapter(dataDir, slug, c.filename);
      out.push({
        filename: c.filename,
        id: c.id,
        title: c.title,
        excerpt: chapterExcerpt(raw)
      });
    } catch {
      out.push({ filename: c.filename, id: c.id, title: c.title, excerpt: "" });
    }
  }
  return out;
}

function timelineCompressedSnippets(dataDir: string, slug: string): Promise<string[]> {
  return readTimelineIndex(dataDir, slug).then((idx) =>
    (idx.compressedRanges || [])
      .slice()
      .sort((a, b) => a.startChapter - b.startChapter)
      .slice(-20)
      .map((r) => `第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
      .filter((s) => s.length > 3)
  );
}

function foreshadowSnippets(dataDir: string, slug: string) {
  return readAuditForeshadowsIndex(dataDir, slug).then((idx) =>
    (idx.foreshadows || [])
      .filter((f) => !idx.hiddenIds?.includes(String(f.id)))
      .slice(0, 40)
      .map((f) => ({
        id: String(f.id),
        title: String(f.title || ""),
        status: String(f.status || ""),
        chapters: f.chapters,
        note: f.note
      }))
  );
}

function stripJsonFence(s: string): string {
  const t = String(s || "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (m ? m[1] : t).trim();
}

function parseJsonObject(text: string): any {
  const jsonText = stripJsonFence(text);
  return JSON.parse(jsonText);
}

export async function runOutlineAi(input: {
  dataDir: string;
  slug: string;
  mode: OutlineAiMode;
  outline: OutlineIndex;
  cfg: OutlineAiModelConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAiSdkModel: (cfg: any) => { model: any; providerOptions: any };
  instruction?: string;
  volumeId?: string;
  chapterFilename?: string;
  options?: {
    useWorld?: boolean;
    useForeshadows?: boolean;
    useTimeline?: boolean;
    targetVolumes?: number;
    logline?: string;
  };
}): Promise<{ preview: Partial<OutlineIndex> | { report: string }; prompt: string; warnings: string[] }> {
  const {
    dataDir,
    slug,
    mode,
    outline,
    cfg,
    createAiSdkModel,
    instruction,
    volumeId,
    chapterFilename,
    options = {}
  } = input;

  const chapters = await listChapters(dataDir, slug);
  const validFilenames = new Set(chapters.map((c) => c.filename));
  const synopsis = await readNovelSynopsis(dataDir, slug);
  const warnings: string[] = [];

  let prompt = "";

  if (mode === "snowflake") {
    const logline = String(options.logline || outline.book.logline || "").trim();
    if (!logline) throw new Error("请填写一句话梗概后再使用雪花起步");
    const worldExcerpt = options.useWorld !== false ? await readWorldExcerpt(dataDir, slug) : "";
    prompt = buildOutlineSnowflakePrompt({
      logline,
      instruction,
      bookSynopsis: synopsis,
      worldExcerpt,
      targetVolumes: options.targetVolumes,
      structureFramework: outline.book.structureFramework
    });
  } else if (mode === "fromChapters") {
    if (!chapters.length) throw new Error("暂无章节，无法反推");
    const excerpts = await loadChapterExcerpts(dataDir, slug, chapters);
    const timelineCompressed = options.useTimeline !== false ? await timelineCompressedSnippets(dataDir, slug) : [];
    const foreshadows = options.useForeshadows !== false ? await foreshadowSnippets(dataDir, slug) : [];
    prompt = buildOutlineFromChaptersPrompt({
      instruction,
      bookSynopsis: synopsis,
      currentOutline: outline,
      chapters: excerpts,
      timelineCompressed,
      foreshadows
    });
  } else if (mode === "refineChapterPlan") {
    const filename = String(chapterFilename || "").trim();
    if (!filename || !validFilenames.has(filename)) throw new Error("请选择有效章节");
    const ch = chapters.find((c) => c.filename === filename)!;
    const excerpts = await loadChapterExcerpts(dataDir, slug, [ch]);
    const vol = outline.volumes.find((v) => v.chapterFilenames.includes(filename));
    const foreshadows = options.useForeshadows !== false ? await foreshadowSnippets(dataDir, slug) : [];
    prompt = buildOutlineRefineChapterPlanPrompt({
      instruction,
      chapter: excerpts[0]!,
      currentPlan: outline.chapterPlans[filename],
      bookLogline: outline.book.logline,
      volumeSynopsis: vol?.synopsis,
      foreshadows
    });
  } else if (mode === "volumeChapterPlans") {
    const vol = outline.volumes.find((v) => v.id === volumeId);
    if (!vol) throw new Error("请选择分卷");
    if (!vol.chapterFilenames.length) throw new Error("该卷暂无章节");
    const excerpts = await loadChapterExcerpts(dataDir, slug, chapters, vol.chapterFilenames);
    const existingPlans: Record<string, unknown> = {};
    for (const f of vol.chapterFilenames) {
      if (outline.chapterPlans[f]) existingPlans[f] = outline.chapterPlans[f];
    }
    prompt = buildOutlineVolumeChapterPlansPrompt({
      instruction,
      volume: vol,
      chapters: excerpts,
      existingPlans
    });
  } else if (mode === "foreshadowAudit") {
    const foreshadows = await foreshadowSnippets(dataDir, slug);
    prompt = buildOutlineForeshadowAuditPrompt({
      outline: outline.book,
      foreshadows,
      chapterPlans: outline.chapterPlans
    });
  } else {
    throw new Error(`未知 mode: ${mode}`);
  }

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: mode === "snowflake" ? 0.45 : 0.25,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
    providerOptions
  } as any);

  const raw = String(text || "");

  if (mode === "foreshadowAudit") {
    return { preview: { report: raw.trim() }, prompt, warnings };
  }

  const parsed = parseJsonObject(raw);
  let preview: Partial<OutlineIndex> = parsed;

  if (mode === "refineChapterPlan" || mode === "volumeChapterPlans") {
    preview = { chapterPlans: parsed.chapterPlans || parsed };
  }

  const stripped = stripInvalidFilenamesFromPreview(preview, validFilenames);
  warnings.push(...stripped.warnings);

  let enriched = enrichOutlineAiPreview(outline, stripped.preview, mode as OutlineAiPreviewMode, {
    volumeId: volumeId || undefined
  });
  enriched = stripInvalidFilenamesFromPreview(enriched, validFilenames).preview;

  return { preview: enriched, prompt, warnings };
}
