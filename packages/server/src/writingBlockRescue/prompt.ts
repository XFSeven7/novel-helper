import { truncateForPrompt } from "../prompts/index.js";
import type { EntropyCard, RescueLength } from "./types.js";

const MAX_MEMORY_CHARS = 12_000;
const MAX_CHAPTER_CHARS = 35_000;
const MAX_CURSOR_HINT_CHARS = 800;
const MAX_ENTROPY_CHARS = 4_000;

function lengthRule(length: RescueLength): string {
  if (length === "short") return "短：每个方案 3-5 条节拍要点，信息密度高。";
  if (length === "long") return "长：每个方案 6-8 条节拍要点，包含更多收束与回收提示。";
  return "中：每个方案 4-6 条节拍要点，覆盖转折与落点。";
}

export function buildWritingBlockRescuePrompt(input: {
  bookMemoryCoarse: string;
  latestChapterText: string;
  cursorHint?: string;
  length: RescueLength;
  moreChaos?: boolean;
  entropyCard?: EntropyCard | null;
  injectEntropy?: boolean;
}): string {
  const memory = truncateForPrompt(input.bookMemoryCoarse || "（全书记忆为空）", MAX_MEMORY_CHARS);
  const chapter = truncateForPrompt(input.latestChapterText || "", MAX_CHAPTER_CHARS);
  const entropy =
    input.injectEntropy && input.entropyCard
      ? truncateForPrompt(JSON.stringify(input.entropyCard, null, 2), MAX_ENTROPY_CHARS)
      : "";

  const baseItem = {
    oneLinePlan: "string（本方案一句话路线，A 必须体现 因→果）",
    readerHook: "string（读者爽点/继续读理由）",
    risk: "string（风险与收束建议；C 在此提供不 OOC 的降级备选）",
    beats: ["string（节拍要点：短句/短语；禁止写正文段落/对白/描写）"],
    sceneCard: {
      goal: "string（目标）",
      conflict: "string（阻力/矛盾）",
      turningPoint: "string（转折）",
      cost: "string（代价）",
      reveal: "string（揭示/信息点；若为新信息则需 newInfo=true）",
      hook: "string（下一章钩子/悬念）"
    },
    decisions: [
      {
        choice: "string（作者可选的下一步选择）",
        consequence: "string（选择的后果）",
        risk: "string（风险）",
        whenToUse: "string（适用条件/触发时机）"
      }
    ],
    citations: ["string（从 BOOK_MEMORY_COARSE 摘取的锚点短语）"],
    newInfo: false,
    oocEdgeTest: false
  } as const;
  const cItem = { ...baseItem, oocEdgeTest: true } as const;
  const schema = {
    event: { A: baseItem, B: baseItem, C: cItem },
    emotion: { A: baseItem, B: baseItem, C: cItem },
    info: { A: baseItem, B: baseItem, C: cItem }
  } as const;

  return [
    "## Role",
    "你是一位资深网文编辑 + 救场编剧。你的任务是帮助作者从卡文中脱困，给出下一段可直接写的草稿。",
    "",
    "## Hard Rules（必须遵守）",
    "1) 不得改变已发生事实；以 BOOK_MEMORY_COARSE 为准。",
    "2) 禁止输出任何可直接作为小说正文使用的内容：不得写对白、不得写描写句、不得输出连续自然段。",
    "3) 所有输出必须是“剧情走向/决策信息”：节拍要点、场景卡片字段、决策点，均用短句/短语。",
    "4) 不得凭空新增关键设定/关键角色/关键道具。",
    "5) 每个方案必须引用 BOOK_MEMORY_COARSE 中至少 1 个锚点，并在 citations 里列出（字符串即可）。",
    "6) 只输出严格 JSON，不要解释、不要 markdown、不要代码块。",
    "7) 输出必须以 `{` 开头、以 `}` 结尾；JSON 前后不得有任何字符（含空行/空格）。",
    "8) beats 数组每个元素必须是短句/短语（建议 <= 30 字），禁止出现引号对话格式、禁止出现长段落。",
    "",
    `## Output Length\n${lengthRule(input.length)}`,
    "",
    "## Options",
    `moreChaos=${Boolean(input.moreChaos)}`,
    `injectEntropy=${Boolean(input.injectEntropy)}`,
    "",
    "## Context",
    "=== BOOK_MEMORY_COARSE ===",
    memory,
    "",
    "=== LATEST_CHAPTER_TEXT ===",
    chapter,
    "",
    input.cursorHint ? "=== CURSOR_HINT ===\n" + truncateForPrompt(input.cursorHint, MAX_CURSOR_HINT_CHARS) : "",
    entropy ? "=== ENTROPY_CARD ===\n" + entropy : "",
    "",
    "## Task",
    "你需要输出 3 路推进（event/emotion/info），每路包含 3 类型（A/B/C）。",
    "",
    "A 顺理成章：只用既有动机/冲突/承诺推进，不引入新变量；oneLinePlan 必须显式包含“因→果”。",
    "B 意料之外：必须引入一个“外来变量”，只能是微小的环境/状态变量（天气、停电、误会、小插曲），禁止直接引入关键设定/关键角色/关键道具。默认优先轻变量；若 moreChaos=true 才可用更强变量。risk 必须说明如何 1-2 段内收束回主线。",
    "C 角色失控：这是 OOC 边缘测试；失控必须有可追溯导火索（来自记忆锚点）。必须输出 oocEdgeTest=true，并在 risk 里提供一个不 OOC 的降级备选。",
    "",
    "B 若提供 ENTROPY_CARD 且 injectEntropy=true，则优先采用该卡作为外来变量。",
    "info 路线若引入章节与记忆中都没有的新事实/线索，必须设置 newInfo=true，并在 risk 中给出兼容理由与回收方式。",
    "",
    "## Output Format (Strict JSON Only)",
    "严格输出以下 JSON 结构（字段可以增加，但不要删除/重命名既有字段）：",
    JSON.stringify(schema, null, 2),
    "",
    "citations 必须是字符串数组，元素是从 BOOK_MEMORY_COARSE 摘取的锚点短语；每个方案至少 1 条。",
    "",
    "现在输出 JSON："
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRescueContextForUi(input: { bookMemoryCoarse: string; latestChapterText: string }) {
  return {
    memoryChars: (input.bookMemoryCoarse || "").length,
    chapterChars: (input.latestChapterText || "").length
  };
}
