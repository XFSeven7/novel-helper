import crypto from "node:crypto";
import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { truncateForPrompt } from "../prompts/index.js";
import type { SpeakerSlot } from "../readerPersonas/schema.js";
import type { ReaderPersona } from "../readerPersonas/types.js";
import type { CommentKind, ReaderCommentReply, ReaderCommentThread } from "./types.js";

function stripJsonFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const i = t.indexOf("\n");
    const j = t.lastIndexOf("```");
    if (i >= 0 && j > i) return t.slice(i + 1, j).trim();
  }
  return t;
}

type AiReplyRaw = {
  personaId?: string;
  text?: string;
  replyToIndex?: number | null;
};

type AiThreadRaw = {
  personaId?: string;
  kind?: string;
  text?: string;
  replies?: AiReplyRaw[];
};

function buildSpeakersPayload(slots: SpeakerSlot[]) {
  return slots.map((s) => ({
    personaId: s.persona.id,
    nickname: s.persona.nickname,
    archetype: s.persona.archetype,
    tier: s.persona.tier,
    traits: s.persona.traits,
    emojiStyle: s.persona.emojiStyle,
    intendedKind: s.intendedKind
  }));
}

export function buildReaderCommentsPrompt(input: {
  chapterContext: string;
  speakerSlots: SpeakerSlot[];
  maxThreads: number;
}): string {
  const deepCount = input.speakerSlots.filter((s) => s.intendedKind === "deep").length;
  const maxThreads = Math.min(input.maxThreads, input.speakerSlots.length);

  return `你是网文平台的读者评论模拟器。根据「章节材料」为下列读者撰写评论区内容。

## 章节材料
${input.chapterContext}

## 本次会发言的读者（thread 的 personaId 必须从下表选取，不得编造新 id；intendedKind 为本地概率抽中的期望类型）
${JSON.stringify(buildSpeakersPayload(input.speakerSlots), null, 2)}

## 输出要求
只输出一个 JSON 对象，不要 markdown 围栏，不要解释：
{
  "threads": [
    {
      "personaId": "builtin-001",
      "kind": "deep" | "short" | "like",
      "text": "主评正文",
      "replies": [
        { "personaId": "builtin-002", "text": "楼中楼", "replyToIndex": null }
      ]
    }
  ]
}

## 规则
- threads 总数不超过 ${maxThreads}；其中 kind=deep 最多 ${deepCount > 0 ? 1 : 0} 条
- 未在上表中的读者不要为其生成 thread
- 每条 text 符合该读者 archetype、emojiStyle（none 尽量无 emoji；heavy 可多用 emoji；每条 emoji ≤ 8）
- 文风像真实网文评论区，口语化，有捧有踩，不要官方口吻
- replies 可选；全章 replies 合计 0～3 条；replyToIndex 为 null 表示回复主评，为数字表示回复 replies 数组中该下标的楼层
- 允许读者之间互怼，但不要人身攻击、涉政色情`;
}

function parseAiThreads(
  raw: string,
  speakerSlots: SpeakerSlot[],
  maxThreads: number,
  newId: (prefix: string) => string,
  now: string
): ReaderCommentThread[] {
  const speakers = speakerSlots.map((s) => s.persona);
  let parsed: { threads?: AiThreadRaw[] };
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as { threads?: AiThreadRaw[] };
  } catch (e) {
    throw new Error(`模拟评论 AI 返回的不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }

  const allowed = new Set(speakers.map((p) => p.id));
  const list = Array.isArray(parsed.threads) ? parsed.threads : [];
  const cap = Math.min(maxThreads, speakers.length);
  let deepUsed = 0;
  const out: ReaderCommentThread[] = [];

  for (const item of list) {
    if (out.length >= cap) break;
    const personaId = String(item.personaId || "").trim();
    if (!allowed.has(personaId)) continue;

    let kind = String(item.kind || "short").trim() as CommentKind;
    if (kind !== "deep" && kind !== "short" && kind !== "like") kind = "short";
    if (kind === "deep") {
      if (deepUsed >= 1) kind = "short";
      else deepUsed += 1;
    }

    const text = String(item.text || "").trim();
    if (!text) continue;

    const threadId = newId("t");
    const replies: ReaderCommentReply[] = [];
    const rawReplies = Array.isArray(item.replies) ? item.replies : [];
    let replyBudget = 3;

    for (const rr of rawReplies) {
      if (replyBudget <= 0) break;
      const rPersona = String(rr.personaId || "").trim();
      if (!allowed.has(rPersona)) continue;
      const rText = String(rr.text || "").trim();
      if (!rText) continue;

      let replyToId: string | null = null;
      const idx = rr.replyToIndex;
      if (typeof idx === "number" && idx >= 0 && idx < replies.length) {
        replyToId = replies[idx]!.id;
      }

      const rid = newId("r");
      replies.push({
        id: rid,
        authorKind: "persona",
        personaId: rPersona,
        replyToId,
        text: rText,
        createdAt: now
      });
      replyBudget -= 1;
    }

    out.push({
      id: threadId,
      personaId,
      kind,
      text,
      createdAt: now,
      replies
    });
  }

  if (!out.length) {
    throw new Error("模拟评论 AI 未生成任何有效评论，请重试或更换模型");
  }

  return out;
}

export async function generateThreadsWithAi(input: {
  chapterContext: string;
  speakerSlots: SpeakerSlot[];
  maxThreads: number;
  cfg: ModelConfig;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  newId: (prefix: string) => string;
  now: string;
}): Promise<ReaderCommentThread[]> {
  if (!input.speakerSlots.length) {
    throw new Error("没有可发言的读者人格");
  }

  const { model, providerOptions } = input.createAiSdkModel(input.cfg);
  const prompt = buildReaderCommentsPrompt({
    chapterContext: input.chapterContext,
    speakerSlots: input.speakerSlots,
    maxThreads: input.maxThreads
  });

  console.log("\n========== [reader-comments] LLM 提示词（完整） ==========\n");
  console.log(prompt);
  console.log("\n========== [reader-comments] 提示词结束 ==========\n");

  const r = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    messages: [{ role: "user", content: prompt }],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"]
  });

  console.log("[reader-comments] LLM 原始回复长度:", r.text?.length ?? 0);

  return parseAiThreads(r.text, input.speakerSlots, input.maxThreads, input.newId, input.now);
}

export async function loadChapterContextForAi(
  dataDir: string,
  bookId: string,
  chapterFilename: string,
  useAnalysis: boolean,
  readChapter: (dataDir: string, bookId: string, filename: string) => Promise<string>,
  readAuditAnalysisText: (dataDir: string, bookId: string, filename: string) => Promise<string>
): Promise<{ contentHash: string; chapterContext: string }> {
  const chapter = await readChapter(dataDir, bookId, chapterFilename);
  const contentHash = crypto.createHash("sha256").update(chapter).digest("hex");

  if (useAnalysis) {
    try {
      const analysis = await readAuditAnalysisText(dataDir, bookId, chapterFilename);
      const trimmed = String(analysis || "").trim();
      if (trimmed.length > 80) {
        return { contentHash, chapterContext: truncateForPrompt(trimmed, 4000) };
      }
    } catch {
      /* fall through */
    }
  }

  const body = chapter.replace(/^#\s+.+\n+/m, "").trim();
  return {
    contentHash,
    chapterContext: truncateForPrompt(body, 800)
  };
}
