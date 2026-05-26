import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./dataDirContext.js";
import { clampCommentsPerChapterRange } from "./readerPersonas/commentsRange.js";

export type ModelProviderId = "openai" | "deepseek" | "gemini" | "qwen" | "ollama" | "custom";

export type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProviderId;
  baseUrl: string;
  apiKey: string;
  testUrl: string;
  model?: string;
  extraHeadersJson?: string;
  lastTestOk?: boolean;
};

export type ReaderCommentsOptions = {
  maxAiCommentsPerChapter: number;
  commentsPerChapterMin: number;
  commentsPerChapterMax: number;
  useChapterAnalysisInput: boolean;
  npcReplyProbability: number;
  readerReplyReaderProbability: number;
  inviteCooldownMs: number;
};

export type FeatureSettingsFile = {
  configs: ModelConfig[];
  activeId: string | null;
  featureModels?: {
    organize?: string | null;
    readerComments?: string | null;
  };
  features?: {
    readerCommentsEnabled?: boolean;
  };
  readerComments?: Partial<ReaderCommentsOptions>;
};

const DEFAULT_READER_COMMENTS: Omit<ReaderCommentsOptions, "commentsPerChapterMin" | "commentsPerChapterMax"> = {
  maxAiCommentsPerChapter: 6,
  useChapterAnalysisInput: true,
  npcReplyProbability: 0.3,
  readerReplyReaderProbability: 0.25,
  inviteCooldownMs: 300_000
};

function settingsDir() {
  return path.join(getDataDir(), "_settings");
}

function settingsPath() {
  return path.join(settingsDir(), "model-configs.json");
}

export function normalizeReaderCommentsOptions(
  raw?: Partial<ReaderCommentsOptions>
): ReaderCommentsOptions {
  const range = clampCommentsPerChapterRange({
    min: typeof raw?.commentsPerChapterMin === "number" ? raw.commentsPerChapterMin : undefined,
    max: typeof raw?.commentsPerChapterMax === "number" ? raw.commentsPerChapterMax : undefined
  });
  return {
    maxAiCommentsPerChapter:
      typeof raw?.maxAiCommentsPerChapter === "number" ? raw.maxAiCommentsPerChapter : DEFAULT_READER_COMMENTS.maxAiCommentsPerChapter,
    commentsPerChapterMin: range.min,
    commentsPerChapterMax: range.max,
    useChapterAnalysisInput:
      typeof raw?.useChapterAnalysisInput === "boolean"
        ? raw.useChapterAnalysisInput
        : DEFAULT_READER_COMMENTS.useChapterAnalysisInput,
    npcReplyProbability:
      typeof raw?.npcReplyProbability === "number" ? raw.npcReplyProbability : DEFAULT_READER_COMMENTS.npcReplyProbability,
    readerReplyReaderProbability:
      typeof raw?.readerReplyReaderProbability === "number"
        ? raw.readerReplyReaderProbability
        : DEFAULT_READER_COMMENTS.readerReplyReaderProbability,
    inviteCooldownMs:
      typeof raw?.inviteCooldownMs === "number" ? raw.inviteCooldownMs : DEFAULT_READER_COMMENTS.inviteCooldownMs
  };
}

export function migrateFeatureSettings(raw: FeatureSettingsFile): FeatureSettingsFile {
  const featureModels = { ...(raw.featureModels ?? {}) };
  if (featureModels.organize == null && raw.activeId) {
    featureModels.organize = raw.activeId;
  }
  return {
    ...raw,
    featureModels,
    features: { readerCommentsEnabled: false, ...raw.features },
    readerComments: normalizeReaderCommentsOptions(raw.readerComments)
  };
}

export async function readFeatureSettings(): Promise<FeatureSettingsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), "utf8")) as FeatureSettingsFile;
    return migrateFeatureSettings(raw);
  } catch {
    return migrateFeatureSettings({ configs: [], activeId: null });
  }
}

export async function writeFeatureSettings(file: FeatureSettingsFile): Promise<void> {
  await fs.mkdir(settingsDir(), { recursive: true });
  const normalized = migrateFeatureSettings(file);
  await fs.writeFile(settingsPath(), JSON.stringify(normalized, null, 2), "utf8");
}

export function resolveOrganizeModelId(file: FeatureSettingsFile): string | null {
  return file.featureModels?.organize ?? file.activeId ?? null;
}

export function resolveReaderCommentsModelId(file: FeatureSettingsFile): string | null {
  return file.featureModels?.readerComments ?? null;
}

export function findModelConfig(file: FeatureSettingsFile, id: string | null | undefined): ModelConfig | undefined {
  if (!id) return undefined;
  return file.configs.find((c) => c.id === id);
}

export function assertReaderCommentsReady(file: FeatureSettingsFile): { cfg: ModelConfig } | { error: string } {
  if (!file.features?.readerCommentsEnabled) {
    return { error: "模拟评论未开启" };
  }
  const modelId = resolveReaderCommentsModelId(file);
  const cfg = findModelConfig(file, modelId);
  if (!cfg) return { error: "请先在设置 → 功能中配置模拟评论模型" };
  if (cfg.lastTestOk === false) return { error: "模拟评论模型未通过连接测试" };
  return { cfg };
}
