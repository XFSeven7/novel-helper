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

export const MODEL_CONFIG_ID_SEP = "::";

export function parseModelConfigId(
  raw: string | null | undefined
): { configId: string; modelName?: string } | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const sep = t.indexOf(MODEL_CONFIG_ID_SEP);
  if (sep > 0) {
    const configId = t.slice(0, sep);
    const modelName = t.slice(sep + MODEL_CONFIG_ID_SEP.length).trim();
    if (!configId) return null;
    return { configId, modelName: modelName || undefined };
  }
  return { configId: t };
}

export function findModelConfig(file: FeatureSettingsFile, id: string | null | undefined): ModelConfig | undefined {
  const parsed = parseModelConfigId(id);
  if (!parsed) return undefined;
  const cfg = file.configs.find((c) => c.id === parsed.configId);
  if (!cfg) return undefined;
  if (parsed.modelName) return { ...cfg, model: parsed.modelName };
  return cfg;
}

/** 自定义 OpenAI 兼容网关：从 testUrl 推断 baseUrl，避免只填测试地址导致 Invalid URL。 */
export function normalizeCustomModelConfig(cfg: ModelConfig): ModelConfig {
  if (cfg.provider !== "custom") return cfg;
  let baseUrl = (cfg.baseUrl || "").trim().replace(/\/$/, "");
  let testUrl = (cfg.testUrl || "").trim();
  const tryParse = (raw: string) => {
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  };
  if (!baseUrl && testUrl) {
    const u = tryParse(testUrl);
    if (u) {
      if (u.pathname.endsWith("/models")) {
        baseUrl = testUrl.replace(/\/models\/?$/, "");
      } else if (/\/v\d+(\/)?$/.test(u.pathname) || u.pathname === "/api/v1") {
        baseUrl = testUrl.replace(/\/$/, "");
        if (!testUrl.endsWith("/models")) testUrl = `${baseUrl}/models`;
      }
    }
  }
  if (baseUrl && !testUrl) testUrl = `${baseUrl}/models`;
  return { ...cfg, baseUrl, testUrl };
}

export function normalizeModelConfigs(configs: ModelConfig[]): ModelConfig[] {
  return configs.map((c) => normalizeCustomModelConfig(c));
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
