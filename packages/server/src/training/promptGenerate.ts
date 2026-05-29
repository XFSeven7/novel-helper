import type { TrainingCategoryPublic, TrainingScenePublic } from "./types.js";

export type GeneratedQuestionDraft = {
  title: string;
  prompt: string;
  minChars: number;
  maxChars: number;
  snippet?: { title: string; body: string };
};

export function buildGenerateQuestionsPrompt(input: {
  scene: TrainingScenePublic;
  count: number;
  existingTitles: string[];
}): string {
  const existing =
    input.existingTitles.length > 0
      ? input.existingTitles.map((t) => `- ${t}`).join("\n")
      : "（暂无）";

  return [
    "你是网文写作训练出题编辑。请为下列**写作场景**生成练习题。",
    "",
    "硬性规则：",
    "- 只输出严格 JSON，格式见下方 schema。",
    "- 每题情境必须不同，禁止与已有题重复情境。",
    "- 人物用甲、乙、某人等泛称；不要引用真实书名或用户书稿。",
    "- 题目须符合网文连载读感，可练、可评；必须贴合本场景类型。",
    `- 本次生成 ${input.count} 道题。`,
    "",
    `## 场景：${input.scene.title}`,
    "## 场景定义",
    input.scene.sceneBrief,
    "",
    "## 学法摘要（出题须贴合）",
    input.scene.contentMarkdown.slice(0, 1500),
    "",
    "## 评改侧重",
    input.scene.rubricHints.map((h) => `- ${h}`).join("\n"),
    "",
    "## 已有题目（勿重复）",
    existing,
    "",
    "## 默认字数范围",
    `minChars: ${input.scene.exerciseDefaults.minChars}, maxChars: ${input.scene.exerciseDefaults.maxChars}`,
    "",
    "## 输出 schema",
    JSON.stringify(
      {
        questions: [
          {
            title: "简短题目标题（≤20字）",
            prompt: "完整练习说明，含具体要求",
            minChars: 80,
            maxChars: 400,
            snippet: { title: "可选范例标题", body: "可选范例或毛病稿，可省略 snippet 字段" }
          }
        ]
      },
      null,
      2
    ),
    "",
    "现在输出 JSON："
  ].join("\n");
}

export function buildCategoryGenerateQuestionsPrompt(input: {
  category: TrainingCategoryPublic;
  count: number;
  existingTitles: string[];
}): string {
  const existing =
    input.existingTitles.length > 0
      ? input.existingTitles.map((t) => `- ${t}`).join("\n")
      : "（暂无）";

  return [
    "你是网文写作训练出题编辑。请为下列题型生成练习题。",
    "",
    "硬性规则：",
    "- 只输出严格 JSON，格式见下方 schema。",
    "- 每题情境必须不同，禁止与已有题重复情境。",
    "- 人物用甲、乙、某人等泛称；不要引用真实书名或用户书稿。",
    "- 题目须符合网文连载读感，可练、可评。",
    `- 本次生成 ${input.count} 道题。`,
    "",
    `## 题型：${input.category.title}`,
    "## 学法摘要（出题须贴合）",
    input.category.contentMarkdown.slice(0, 1200),
    "",
    "## 评改侧重",
    input.category.rubricHints.map((h) => `- ${h}`).join("\n"),
    "",
    "## 已有题目（勿重复）",
    existing,
    "",
    "## 默认字数范围",
    `minChars: ${input.category.exerciseDefaults.minChars}, maxChars: ${input.category.exerciseDefaults.maxChars}`,
    "",
    "## 输出 schema",
    JSON.stringify(
      {
        questions: [
          {
            title: "简短题目标题（≤20字）",
            prompt: "完整练习说明，含具体要求",
            minChars: 80,
            maxChars: 400,
            snippet: { title: "可选范例标题", body: "可选范例或毛病稿，可省略 snippet 字段" }
          }
        ]
      },
      null,
      2
    ),
    "",
    "现在输出 JSON："
  ].join("\n");
}
