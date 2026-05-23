import { generateText } from "ai";
import type { OutlineAiModelConfig } from "../outlineAi.js";
import { BOOK_SETUP_DIALOGUE_RULES } from "../prompts/bookSetup/dialogue-rules.js";
import type {
  BookSetupChatMessage,
  BookSetupChatResponse,
  BookSetupChatSuggestion,
  BookSetupDraft,
  BookSetupStepId
} from "./types.js";

const SUGGESTION_KEYS: (keyof BookSetupChatSuggestion)[] = [
  "concept",
  "genreNotes",
  "targetWords",
  "targetChapters",
  "structureFramework",
  "title",
  "metaSynopsis",
  "logline",
  "synopsis",
  "mainlineStages",
  "volumes"
];

const STEP_HINTS: Record<BookSetupStepId, string> = {
  intent: "本步只讨论：题材、创作概念、想写什么样的故事。可建议 concept、genreNotes。",
  scale: "本步只讨论：目标总字数、目标章数、结构框架（如三幕式/四幕式）。",
  logline: "本步只讨论：一句话梗概；须具体、可验证，避免「变强复仇」空话。参考：全书终局 Objective 一句话。",
  synopsis:
    "本步只讨论：五段式梗概（起因/发展/转折/高潮/结局）及前台/后台双层故事、核心冲突。不要写分卷章号。",
  mainline:
    "本步只讨论：主线阶段（label、chapterRange 示意、note 剧情备注），不写具体章节任务。每次回复须根据截至目前整段对话，输出当前已共识的完整 mainlineStages 列表。",
  volumes: "本步只讨论：分卷数量、各卷 title/order/synopsis；禁止指定第几章发生什么。",
  chapterSkeleton: "本步只讨论：各卷预计章数或每章一句 core 骨架；可不细化。",
  meta: "本步只讨论：书名、书籍简介（进 meta.json）。",
  review: "本步帮助用户检查草案是否可创建；不生成新书内容。"
};

const STEP_APPLY_FIELDS: Record<BookSetupStepId, string> = {
  intent: "concept, genreNotes",
  scale: "targetWords, targetChapters, structureFramework",
  logline: "logline（写入 outline.book.logline）",
  synopsis: "synopsis: { setup, development, twist, climax, ending }",
  mainline:
    "mainlineStages: [{ label, chapterRange, note }] 完整数组；根据对话判断当前已共识的全部阶段及备注",
  volumes: "volumes: [{ title, order, synopsis }]",
  chapterSkeleton: "chapterPlans 或卷级章数说明（若对话有）",
  meta: "title, metaSynopsis",
  review: "（不可应用）"
};

const MAINLINE_STAGE_SYNC_RULES = `## 主线阶段同步（本步必须遵守）
- 根据「截至目前」的完整对话（含历史轮次），判断当前已共识的主线阶段有哪些；随讨论推进可增删改阶段。
- 每次回复的 suggestion 必须包含 mainlineStages 数组：**当前完整列表**（不是只写本轮新增的一条）。
- 每项字段：label（阶段名）、chapterRange（章范围示意，如 1-20，可空）、note（本阶段剧情走向、冲突与转折，可多句）。
- 若对话只细化某一个阶段，仍输出完整列表，其余阶段从左侧草案或前文共识中保留。
- 尚未形成任何阶段时：mainlineStages 可为 []，在 assistantMessage 中说明还需什么信息。
- 示例 suggestion 片段：
  "mainlineStages": [
    { "label": "蛰伏立足", "chapterRange": "1-30", "note": "主角隐藏身份积累资源…" },
    { "label": "第一次翻盘", "chapterRange": "31-80", "note": "…" }
  ]`;

function buildStepSystem(stepId: BookSetupStepId): string {
  const parts = [
    "你是 novelHelper 的建书前规划助手，扮演专业网文结构编辑。",
    BOOK_SETUP_DIALOGUE_RULES,
    "",
    STEP_HINTS[stepId]
  ];
  if (stepId === "mainline") {
    parts.push("", MAINLINE_STAGE_SYNC_RULES);
  }
  parts.push(
    "",
    "## 本轮回应",
    "- 以用户**最新一条**消息为准；上一轮 assistantMessage 出现过的句子/编号项，本轮不得原文重复。",
    "- 有新剧情共识时，用 1–3 句说明变化即可，其余写入 suggestion。",
    "",
    "## 输出格式（必须严格遵守）",
    "- 回复有且仅有一个 JSON 对象，不要在 JSON 前后写任何说明、标题或 markdown 代码块。",
    "- assistantMessage 只写给人看的自然语言；mainlineStages、梗概等结构化字段只能放在 suggestion 里，禁止在 assistantMessage 里贴 JSON。",
    "- 格式：",
    `{
  "assistantMessage": "给用户看的简短回复",
  "nextQuestion": "可选，下一步建议用户思考的一个问题",
  "missingFields": ["可选，还缺的要点"],
  "suggestion": { }
}`,
    stepId === "mainline"
      ? "mainline 步：只要对话对阶段有任何进展，suggestion 应含 mainlineStages（完整列表）。"
      : "suggestion 仅包含本步相关字段；无建议则省略 suggestion。"
  );
  return parts.join("\n");
}

function draftContextSummary(draft: BookSetupDraft): string {
  return JSON.stringify(
    {
      concept: draft.concept,
      genreNotes: draft.genreNotes,
      targetWords: draft.targetWords,
      targetChapters: draft.targetChapters,
      structureFramework: draft.structureFramework,
      title: draft.title,
      metaSynopsis: draft.metaSynopsis,
      book: draft.outline.book,
      volumes: draft.outline.volumes.map((v) => ({
        title: v.title,
        order: v.order,
        synopsis: v.synopsis
      }))
    },
    null,
    2
  );
}

function normalizeChatRole(role: string): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

/** 去掉连续重复轮次（乐观保存或重试导致） */
export function dedupeChatHistory(history: BookSetupChatMessage[]): BookSetupChatMessage[] {
  const out: BookSetupChatMessage[] = [];
  for (const m of history) {
    const role = normalizeChatRole(m.role);
    const content = String(m.content ?? "").trim();
    if (!content) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role && prev.content === content) continue;
    out.push({ role, content });
  }
  return out;
}

/** 发送前：若末尾已是同内容用户消息则去掉，避免与本轮输入重复送入模型 */
function historyBeforeUserTurn(history: BookSetupChatMessage[], userMessage: string): BookSetupChatMessage[] {
  let h = dedupeChatHistory(history);
  const msg = userMessage.trim();
  while (h.length > 0 && h[h.length - 1]!.role === "user" && h[h.length - 1]!.content.trim() === msg) {
    h = h.slice(0, -1);
  }
  return h;
}

/** 保存会话：合并本轮用户/助手消息且不去重写入 */
export function appendChatTurn(
  history: BookSetupChatMessage[],
  userMessage: string,
  assistantMessage: string
): BookSetupChatMessage[] {
  const user = userMessage.trim();
  const assistant = assistantMessage.trim();
  let next = historyBeforeUserTurn(history, user);
  const last = next[next.length - 1];
  if (!last || last.role !== "user" || last.content !== user) {
    next = [...next, { role: "user", content: user }];
  }
  if (assistant) {
    const tail = next[next.length - 1];
    if (!(tail?.role === "assistant" && tail.content === assistant)) {
      next = [...next, { role: "assistant", content: assistant }];
    }
  }
  return next;
}

type SdkChatMessage = { role: "system" | "user" | "assistant"; content: string };

function logBookSetupPrompt(
  op: "chat" | "chat-retry" | "apply" | "redesign-mainline",
  stepId: BookSetupStepId,
  messages: SdkChatMessage[]
): void {
  const sep = "=".repeat(72);
  console.log(`\n${sep}`);
  console.log(`[book-setup] 提示词 · ${op} · step=${stepId} · ${messages.length} 条消息`);
  console.log(sep);
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    console.log(`\n--- [${i + 1}/${messages.length}] ${m.role.toUpperCase()} ---\n`);
    console.log(m.content);
  }
  console.log(`\n${sep}\n`);
}

const HISTORY_MAX_MESSAGES = 14;
const OLD_ASSISTANT_MAX_CHARS = 320;

/** 较早的助手回复截断，避免模型照抄长列表 */
function compressOlderAssistantMessages(history: BookSetupChatMessage[]): BookSetupChatMessage[] {
  let lastAssistantIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  return history.map((m, i) => {
    if (m.role !== "assistant" || i === lastAssistantIdx) return m;
    const text = m.content.trim();
    if (text.length <= OLD_ASSISTANT_MAX_CHARS) return m;
    return {
      role: "assistant" as const,
      content: `${text.slice(0, OLD_ASSISTANT_MAX_CHARS)}\n…（更早回复已截断，勿复述其中条目）`
    };
  });
}

function trimHistoryForModel(history: BookSetupChatMessage[]): BookSetupChatMessage[] {
  if (history.length <= HISTORY_MAX_MESSAGES) return history;
  return history.slice(-HISTORY_MAX_MESSAGES);
}

function prepareHistoryForPrompt(history: BookSetupChatMessage[], userMessage: string): BookSetupChatMessage[] {
  return compressOlderAssistantMessages(trimHistoryForModel(historyBeforeUserTurn(history, userMessage)));
}

function lastAssistantMessage(history: BookSetupChatMessage[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "assistant") return history[i]!.content;
  }
  return undefined;
}

function lineOverlapRatio(previous: string, next: string): number {
  const prevLines = previous
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 10);
  if (prevLines.length === 0) return 0;
  let hit = 0;
  for (const line of prevLines) {
    const snippet = line.slice(0, Math.min(28, line.length));
    if (snippet.length >= 8 && next.includes(snippet)) hit++;
  }
  return hit / prevLines.length;
}

function isMostlyRepetitiveAssistantReply(previous: string | undefined, next: string): boolean {
  const prev = previous?.trim();
  const nxt = next.trim();
  if (!prev || !nxt) return false;
  if (prev === nxt) return true;
  if (lineOverlapRatio(prev, nxt) >= 0.4) return true;
  const np = prev.replace(/\s/g, "");
  const nn = nxt.replace(/\s/g, "");
  if (np.length > 60 && nn.includes(np.slice(0, Math.min(100, np.length)))) return true;
  return false;
}

function buildChatUserTurn(message: string, retry: boolean): string {
  const m = message.trim();
  if (retry) {
    return `${m}\n\n【重要】你上一轮与再上一轮内容高度重复。请只针对本条消息用新表述补充，禁止复制之前的编号列表；最多 3 句 + 1 个追问。`;
  }
  return `${m}\n\n（请只回应本条新消息；不要复述你上一轮已列出的相同要点。）`;
}

function toSdkMessages(
  system: string,
  history: BookSetupChatMessage[],
  finalUser: string
): SdkChatMessage[] {
  const messages: SdkChatMessage[] = [{ role: "system", content: system }];
  for (const m of history) {
    const role = normalizeChatRole(m.role);
    const content = m.content.trim();
    if (!content) continue;
    const prev = messages[messages.length - 1];
    if (prev && prev.role === role && prev.content === content) continue;
    messages.push({ role, content });
  }
  const tail = finalUser.trim();
  if (tail) {
    const prev = messages[messages.length - 1];
    if (!(prev?.role === "user" && prev.content === tail)) {
      messages.push({ role: "user", content: tail });
    }
  }
  return messages;
}

function stripJsonFence(s: string): string {
  const t = String(s || "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (m ? m[1] : t).trim();
}

/** 从混合文本中提取第一个完整 JSON 对象（模型常在 JSON 前写说明） */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripJsonFence(text);
  try {
    const v = JSON.parse(trimmed) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* whole-string parse failed */
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const v = JSON.parse(fenced[1].trim()) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* */
    }
  }

  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1)) as unknown;
          if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
        } catch {
          /* */
        }
      }
    }
  }
  return null;
}

function pickSuggestion(obj: Record<string, unknown>): BookSetupChatSuggestion | undefined {
  const fromNested =
    obj.suggestion && typeof obj.suggestion === "object" && !Array.isArray(obj.suggestion)
      ? (obj.suggestion as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...fromNested };
  for (const key of SUGGESTION_KEYS) {
    if (obj[key] !== undefined && merged[key] === undefined) merged[key] = obj[key];
  }
  const suggestion: BookSetupChatSuggestion = {};
  for (const key of SUGGESTION_KEYS) {
    if (merged[key] !== undefined) (suggestion as Record<string, unknown>)[key] = merged[key];
  }
  return Object.keys(suggestion).length > 0 ? suggestion : undefined;
}

function stripMarkdownJsonBlocks(text: string): string {
  return String(text || "")
    .replace(/```(?:json)?\s*[\s\S]*?```/gi, "")
    .trim();
}

function normalizeParsedResponse(obj: Record<string, unknown>, preamble: string): BookSetupChatResponse {
  const fromJson = String(obj.assistantMessage ?? "").trim();
  let assistantMessage = fromJson || stripMarkdownJsonBlocks(preamble);
  const cleanPreamble = stripMarkdownJsonBlocks(preamble);
  if (fromJson && cleanPreamble && !fromJson.includes(cleanPreamble.slice(0, Math.min(24, cleanPreamble.length)))) {
    assistantMessage = `${cleanPreamble}\n\n${fromJson}`.trim();
  }
  assistantMessage = stripMarkdownJsonBlocks(stripJsonFromDisplayText(assistantMessage));

  return {
    assistantMessage: assistantMessage || "好的，我已记录。",
    nextQuestion: obj.nextQuestion != null ? String(obj.nextQuestion).trim() || undefined : undefined,
    missingFields: Array.isArray(obj.missingFields)
      ? obj.missingFields.map((x) => String(x)).filter(Boolean)
      : undefined,
    suggestion: pickSuggestion(obj)
  };
}

/** 存入会话 / 展示用的助手正文（不含 ```json 块） */
export function assistantMessageForStorage(parsed: BookSetupChatResponse, raw: string): string {
  const msg = parsed.assistantMessage?.trim();
  if (msg) return stripMarkdownJsonBlocks(msg);
  return stripMarkdownJsonBlocks(stripJsonFromDisplayText(raw));
}

/** 去掉消息里误贴的 JSON 块，避免聊天气泡展示原始数据 */
function stripJsonFromDisplayText(text: string): string {
  const t = stripMarkdownJsonBlocks(String(text || "").trim());
  if (!t) return t;
  const obj = extractJsonObject(t);
  if (obj && typeof obj.assistantMessage === "string" && String(obj.assistantMessage).trim()) {
    return String(obj.assistantMessage).trim();
  }
  const start = t.indexOf("{");
  if (start > 0) {
    const before = t.slice(0, start).trim();
    if (before) return before;
  }
  if (start === 0 && obj && typeof obj.assistantMessage === "string") {
    return String(obj.assistantMessage).trim();
  }
  return t;
}

function parseChatResponse(raw: string): BookSetupChatResponse {
  const text = String(raw || "").trim();
  if (!text) return { assistantMessage: "" };

  const jsonStart = text.indexOf("{");
  const preamble = jsonStart > 0 ? text.slice(0, jsonStart).trim() : "";

  const obj = extractJsonObject(text);
  if (obj) return normalizeParsedResponse(obj, preamble);

  return { assistantMessage: stripJsonFromDisplayText(text) };
}

export async function chatBookSetupStep(input: {
  draft: BookSetupDraft;
  stepId: BookSetupStepId;
  message: string;
  cfg: OutlineAiModelConfig;
  createAiSdkModel: (cfg: OutlineAiModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<BookSetupChatResponse> {
  const rawHistory = input.draft.stepMessages[input.stepId] ?? [];
  const history = prepareHistoryForPrompt(rawHistory, input.message);
  const { model, providerOptions } = input.createAiSdkModel(input.cfg);
  const prevAssistant = lastAssistantMessage(history);

  const system = [
    buildStepSystem(input.stepId),
    "",
    "当前已填草案（供参考；与用户表述冲突时以用户为准）:",
    draftContextSummary(input.draft)
  ].join("\n");

  const runOnce = async (retry: boolean) => {
    const messages = toSdkMessages(system, history, buildChatUserTurn(input.message, retry));
    logBookSetupPrompt(retry ? "chat-retry" : "chat", input.stepId, messages);
    const result = await generateText({
      model: model as Parameters<typeof generateText>[0]["model"],
      providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
      messages,
      temperature: retry ? 0.5 : 0.35
    });
    return parseChatResponse(result.text);
  };

  let parsed = await runOnce(false);
  if (isMostlyRepetitiveAssistantReply(prevAssistant, parsed.assistantMessage)) {
    console.warn("[book-setup] 助手回复与上一轮高度相似，自动重试一次");
    const retried = await runOnce(true);
    if (!isMostlyRepetitiveAssistantReply(prevAssistant, retried.assistantMessage)) {
      parsed = retried;
    } else {
      parsed = {
        ...retried,
        assistantMessage: `好的，已记录你关于「${input.message.trim().slice(0, 40)}」的补充。${retried.nextQuestion ? ` ${retried.nextQuestion}` : " 还需要我帮你细化哪一点？"}`
      };
    }
  }

  return parsed;
}

function buildApplyFromChatSystem(stepId: BookSetupStepId): string {
  const parts = [
    "你是 novelHelper 建书向导的「字段提取」助手。",
    "任务：阅读本步完整对话与当前已填草案，把对话里达成的共识整理为可写入左侧表单的 JSON。",
    "",
    "规则：",
    "- 综合整段对话（含用户与助手所有轮次），不要只看最后一句。",
    "- 只输出本步字段；字段范围：" + STEP_APPLY_FIELDS[stepId],
    "- suggestion 给出应写入的完整内容（前端会直接覆盖本步对应字段）。",
    "- 对话未提及的字段不要编造；无法确定则省略该键。",
    "- 禁止代写章节正文。"
  ];
  if (stepId === "mainline") {
    parts.push("", MAINLINE_STAGE_SYNC_RULES);
  }
  parts.push(
    "",
    "## 输出格式",
    "- 有且仅输出一个 JSON 对象，不要在 JSON 前后附加文字或代码块。",
    "- assistantMessage 只用自然语言；结构化字段放在 suggestion。",
    `{
  "assistantMessage": "一句说明：已从对话整理哪些内容",
  "suggestion": { }
}`,
    stepId === "mainline"
      ? "mainline 步：只要对话对阶段有共识，suggestion 必须含 mainlineStages（完整数组，可为 []）。"
      : ""
  );
  return parts.filter(Boolean).join("\n");
}

export async function applyBookSetupFromChat(input: {
  draft: BookSetupDraft;
  stepId: BookSetupStepId;
  cfg: OutlineAiModelConfig;
  createAiSdkModel: (cfg: OutlineAiModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<BookSetupChatResponse> {
  if (input.stepId === "review") {
    return { assistantMessage: "总览步请直接在左侧确认后创建。" };
  }

  const history = dedupeChatHistory(input.draft.stepMessages[input.stepId] ?? []);
  if (history.length === 0) {
    return { assistantMessage: "请先在右侧与 AI 对话，再应用到本步。" };
  }

  const { model, providerOptions } = input.createAiSdkModel(input.cfg);

  const system = [
    buildApplyFromChatSystem(input.stepId),
    "",
    "左侧已填草案（仅供参考，应用时可覆盖）:",
    draftContextSummary(input.draft)
  ].join("\n");

  const messages = toSdkMessages(
    system,
    history,
    "请根据以上对话，输出 suggestion JSON，用于填充左侧本步表单。"
  );
  logBookSetupPrompt("apply", input.stepId, messages);

  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
    messages,
    temperature: 0.25
  });

  return parseChatResponse(result.text);
}

const MAINLINE_REDESIGN_SYSTEM = `你是 novelHelper 的「主线阶段重构」助手。
任务：根据本步完整对话与全书草案，**重新设计**主线阶段列表（可合并、拆分、改名、调整章范围与备注），输出合理、可执行的阶段规划。

## 原则
- 综合对话里所有剧情共识，不要遗漏关键转折；可舍弃与对话矛盾或过细的旧阶段划分。
- 阶段数量通常 3–8 个，覆盖从开篇到终局；章范围示意需与目标总章数（若有）大致匹配、前后不重叠。
- 每项：label（阶段名，简短有力）、chapterRange（如 1–30）、note（本阶段核心冲突、走向、与下阶段的衔接）。
- 左侧「当前阶段」仅作参考，你有权整体推翻并重排。
- 禁止代写具体章节正文。

## 输出
- 有且仅有一个 JSON 对象，不要 markdown 代码块。
- assistantMessage：2–4 句说明新阶段结构的设计思路（不要贴 JSON）。
- suggestion.mainlineStages：**完整新列表**（替换左侧全部阶段，不是增量补丁）。`;

/** 根据对话整体重新规划主线阶段（整表替换） */
export async function redesignMainlineFromChat(input: {
  draft: BookSetupDraft;
  cfg: OutlineAiModelConfig;
  createAiSdkModel: (cfg: OutlineAiModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<BookSetupChatResponse> {
  const history = dedupeChatHistory(input.draft.stepMessages.mainline ?? []);
  if (history.length === 0) {
    return { assistantMessage: "请先在右侧与 AI 讨论主线，再重新整理阶段。" };
  }

  const { model, providerOptions } = input.createAiSdkModel(input.cfg);
  const currentStages = input.draft.outline.book.mainlineStages ?? [];

  const system = [
    MAINLINE_REDESIGN_SYSTEM,
    "",
    "全书草案（体量、梗概等）:",
    draftContextSummary(input.draft),
    "",
    "当前左侧阶段（可全部重做）:",
    JSON.stringify(currentStages, null, 2)
  ].join("\n");

  const messages = toSdkMessages(
    system,
    compressOlderAssistantMessages(trimHistoryForModel(history)),
    "请根据以上对话，重新规划全书主线阶段：输出 suggestion.mainlineStages 完整数组，并简要说明设计思路。"
  );
  logBookSetupPrompt("redesign-mainline", "mainline", messages);

  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
    messages,
    temperature: 0.3
  });

  const parsed = parseChatResponse(result.text);
  if (parsed.suggestion?.mainlineStages === undefined) {
    return {
      ...parsed,
      assistantMessage:
        parsed.assistantMessage ||
        "未能生成新的阶段列表，请补充对话后重试，或检查模型是否按 JSON 返回了 mainlineStages。"
    };
  }
  return parsed;
}
