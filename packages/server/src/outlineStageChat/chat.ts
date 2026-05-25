import { streamText } from "ai";
import { buildStageChatSystemPrompt } from "./prompt.js";
import type { StageChatModelMessage } from "./types.js";

export type StageChatDeps = {
  readModelSettings: () => Promise<{
    configs: Array<{ id: string }>;
    activeId: string | null;
  }>;
  createAiSdkModel: (cfg: unknown) => { model: unknown; providerOptions: unknown };
};

export async function performStageChat(
  deps: StageChatDeps,
  opts: {
    modelConfigId?: string | null;
    contextBlock: string;
    history: StageChatModelMessage[];
    userMessage: string;
    onDelta?: (delta: string) => void;
  }
): Promise<string> {
  const settings = await deps.readModelSettings();
  const activeId = opts.modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const userMessage = opts.userMessage.trim();
  if (!userMessage) throw new Error("userMessage required");

  const { model, providerOptions } = deps.createAiSdkModel(cfg);
  const r = await streamText({
    model,
    messages: [
      { role: "system", content: buildStageChatSystemPrompt(opts.contextBlock) },
      ...opts.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage }
    ],
    providerOptions
  } as Parameters<typeof streamText>[0]);

  for await (const delta of r.textStream) {
    if (delta) opts.onDelta?.(delta);
  }

  return String((await r.text) || "");
}
