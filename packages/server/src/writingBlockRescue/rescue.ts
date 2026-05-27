import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { lookupEntropyCard } from "./cards.js";
import { readBookMemoryCoarse, readChapterTextForRescue } from "./memory.js";
import { buildRescueContextForUi, buildWritingBlockRescuePrompt } from "./prompt.js";
import type {
  RescueItem,
  RescueRequest,
  RescueResult,
  RescueRoute,
  RescueVariant,
  EntropyCard
} from "./types.js";
import { isRescueVariant } from "./types.js";

const ROUTES: RescueRoute[] = ["event", "emotion", "info"];
const VARIANTS: RescueVariant[] = ["A", "B", "C"];

function stripJsonFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const i = t.indexOf("\n");
    const j = t.lastIndexOf("```");
    if (i >= 0 && j > i) return t.slice(i + 1, j).trim();
  }
  return t;
}

function parseRescueJson(raw: string): unknown {
  const t = stripJsonFence(String(raw || ""));
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回有效 JSON");
  return JSON.parse(t.slice(start, end + 1));
}

function normalizeRescueItem(raw: unknown): RescueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const oneLinePlan = String(o.oneLinePlan ?? "").trim();
  const readerHook = String(o.readerHook ?? "").trim();
  const risk = String(o.risk ?? "").trim();
  const citations = Array.isArray(o.citations)
    ? o.citations.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const beats = Array.isArray(o.beats) ? o.beats.map((x) => String(x).trim()).filter(Boolean) : [];
  const sceneCardRaw = o.sceneCard && typeof o.sceneCard === "object" ? (o.sceneCard as any) : null;
  const sceneCard = sceneCardRaw
    ? {
        goal: String(sceneCardRaw.goal ?? "").trim(),
        conflict: String(sceneCardRaw.conflict ?? "").trim(),
        turningPoint: String(sceneCardRaw.turningPoint ?? "").trim(),
        cost: String(sceneCardRaw.cost ?? "").trim(),
        reveal: String(sceneCardRaw.reveal ?? "").trim(),
        hook: String(sceneCardRaw.hook ?? "").trim()
      }
    : null;
  const decisions = Array.isArray(o.decisions)
    ? o.decisions
        .map((d: any) => ({
          choice: String(d?.choice ?? "").trim(),
          consequence: String(d?.consequence ?? "").trim(),
          risk: String(d?.risk ?? "").trim(),
          whenToUse: String(d?.whenToUse ?? "").trim()
        }))
        .filter((d) => d.choice && d.consequence)
    : [];

  if (!oneLinePlan || !readerHook || beats.length < 3 || !sceneCard) return null;
  if (!sceneCard.goal || !sceneCard.conflict || !sceneCard.turningPoint || !sceneCard.hook) return null;

  return {
    oneLinePlan,
    readerHook,
    risk,
    beats,
    sceneCard,
    decisions,
    citations,
    ...(o.newInfo === true ? { newInfo: true } : {}),
    ...(o.oocEdgeTest === true ? { oocEdgeTest: true } : {})
  };
}

export function normalizeRescueResult(raw: unknown): RescueResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("JSON 结构无效");
  }
  const root = raw as Record<string, unknown>;
  const out = {} as RescueResult;
  for (const route of ROUTES) {
    const routeObj = root[route];
    if (!routeObj || typeof routeObj !== "object") {
      throw new Error(`缺少路线 ${route}`);
    }
    const routeRecord = routeObj as Record<string, unknown>;
    out[route] = {} as Record<RescueVariant, RescueItem>;
    for (const variant of VARIANTS) {
      const item = normalizeRescueItem(routeRecord[variant]);
      if (!item) throw new Error(`${route}.${variant} 字段不完整`);
      out[route][variant] = item;
    }
  }
  return out;
}

export type RescueDeps = {
  getDataDir: () => string;
  readModelSettings: () => Promise<{ configs: ModelConfig[]; activeId: string | null }>;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  pickModelCfg: (settings: { configs: ModelConfig[] }, rawId: string | null | undefined) => ModelConfig;
};

export async function performWritingBlockRescue(
  deps: RescueDeps,
  input: RescueRequest
): Promise<{ result: RescueResult; context: { memoryChars: number; chapterChars: number } }> {
  const dataDir = deps.getDataDir();
  const bookMemoryCoarse = await readBookMemoryCoarse(dataDir, input.bookId);
  const latestChapterText = await readChapterTextForRescue(dataDir, input.bookId, input.chapterFilename);
  const entropyCard: EntropyCard | null =
    input.entropyCardId && input.injectEntropy ? lookupEntropyCard(input.entropyCardId) : null;

  const settings = await deps.readModelSettings();
  const cfg = deps.pickModelCfg({ configs: settings.configs }, settings.activeId);
  const { model, providerOptions } = deps.createAiSdkModel(cfg);
  const prompt = buildWritingBlockRescuePrompt({
    bookMemoryCoarse,
    latestChapterText,
    cursorHint: input.cursorHint,
    length: input.length,
    moreChaos: Boolean(input.moreChaos),
    entropyCard,
    injectEntropy: Boolean(input.injectEntropy)
  });

  console.log("\n[writing-block-rescue] ===== PROMPT BEGIN =====\n");
  console.log(prompt);
  console.log("\n[writing-block-rescue] ===== PROMPT END =====\n");

  const { text } = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
    messages: [{ role: "user", content: prompt }]
  });

  console.log("\n[writing-block-rescue] ===== RAW BEGIN =====\n");
  console.log(String(text || ""));
  console.log("\n[writing-block-rescue] ===== RAW END =====\n");

  const parsed = parseRescueJson(String(text || ""));
  const result = normalizeRescueResult(parsed);
  const context = buildRescueContextForUi({ bookMemoryCoarse, latestChapterText });
  return { result, context };
}

export { isRescueVariant };
