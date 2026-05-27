import { streamText } from "ai";
import { findModelConfig, type FeatureSettingsFile } from "../featureSettings.js";
import { buildWritingGuidanceSystemPrompt } from "./prompt.js";
import { trimMessagesForModel } from "./store.js";
import type { GuidanceMessage } from "./types.js";

export type WritingGuidanceChatDeps = {
  readModelSettings: () => Promise<{
    configs: Array<{ id: string }>;
    activeId: string | null;
  }>;
  createAiSdkModel: (cfg: unknown) => { model: unknown; providerOptions: unknown };
};

export async function performWritingGuidanceChat(
  deps: WritingGuidanceChatDeps,
  opts: {
    modelConfigId?: string | null;
    history: GuidanceMessage[];
    userMessage: string;
    onDelta?: (delta: string) => void;
  }
): Promise<string> {
  const settings = await deps.readModelSettings();
  const activeId = opts.modelConfigId || settings.activeId;
  const cfg =
    findModelConfig({ configs: settings.configs, activeId: settings.activeId } as FeatureSettingsFile, activeId) ||
    settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const trimmed = trimMessagesForModel(opts.history);
  const isFirstTurn = trimmed.length === 0;
  const sdkHistory = trimmed.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const userMessage = opts.userMessage.trim();
  if (!userMessage) throw new Error("userMessage required");

  const { model, providerOptions } = deps.createAiSdkModel(cfg);
  const r = await streamText({
    model,
    messages: [
      { role: "system", content: buildWritingGuidanceSystemPrompt({ isFirstTurn }) },
      ...sdkHistory,
      { role: "user", content: userMessage }
    ],
    providerOptions
  } as Parameters<typeof streamText>[0]);

  for await (const delta of r.textStream) {
    if (delta) opts.onDelta?.(delta);
  }

  return String((await r.text) || "");
}
