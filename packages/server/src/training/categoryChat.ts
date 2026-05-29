import { streamText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import type { TrainingCategoryPublic, TrainingChatMessage } from "./types.js";

const TEACHING_CONTEXT_MAX = 12000;

export function buildCategoryChatSystem(category: TrainingCategoryPublic): string {
  const hints = category.rubricHints.map((h) => `- ${h}`).join("\n");
  const teaching = category.contentMarkdown.slice(0, TEACHING_CONTEXT_MAX);

  return [
    "你是 novelHelper 网文写作训练场的「学法辅导」助手。",
    "",
    "规则：",
    "- 仅解答当前题型相关的笔法、概念、例题理解；语气清晰、具体。",
    "- **禁止**代写用户应提交的练习正文；可给思路、检查清单、改写单句示范。",
    "- 不要假设用户有书架、连载书或设定库；训练与真实写作隔离。",
    "- 回答使用简体中文。",
    "",
    `## 当前题型：${category.title}`,
    "",
    "## 本类严师评改要点（供参考）",
    hints,
    "",
    "## 本类学法",
    teaching
  ].join("\n");
}

export async function performCategoryChat(deps: {
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  cfg: ModelConfig;
  category: TrainingCategoryPublic;
  history: TrainingChatMessage[];
  userMessage: string;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const userMessage = deps.userMessage.trim();
  if (!userMessage) throw new Error("userMessage required");

  const sdkHistory = deps.history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const { model, providerOptions } = deps.createAiSdkModel(deps.cfg);
  const r = await streamText({
    model: model as Parameters<typeof streamText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
    messages: [
      { role: "system", content: buildCategoryChatSystem(deps.category) },
      ...sdkHistory,
      { role: "user", content: userMessage }
    ]
  } as Parameters<typeof streamText>[0]);

  for await (const delta of r.textStream) {
    if (delta) deps.onDelta?.(delta);
  }

  return String((await r.text) || "");
}
