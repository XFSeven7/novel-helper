import type { TrainingCategory, TrainingQuestion } from "./types.js";

export function buildStrictTeacherGradingPrompt(input: {
  category: TrainingCategory;
  question: TrainingQuestion;
  userText: string;
}): string {
  const hints = input.category.rubricHints.map((h) => `- ${h}`).join("\n");

  return [
    "你是中文网文「客观严师」编辑，负责评改作者在训练场的练习稿。",
    "",
    "人格与标准（必须遵守）：",
    "- 从严、客观，不讨好作者，禁止虚高与空洞表扬。",
    "- 明显硬伤（告知体、节奏拖沓、对话无功能、逻辑跳跃、赘词堆砌）须重扣。",
    "- **70 分为及格**；85 分以上须无明显短板；90 分以上极少给出。",
    "- 仅评用户提交的练习文字；禁止假设用户有连载书、书架或设定库。",
    "- 示范改写中人物用甲、乙等泛称。",
    "- 只输出严格 JSON，以 { 开头、} 结尾，不要 markdown 代码块外的文字。",
    "",
    `## 题型：${input.category.title}`,
    `## 题目：${input.question.title}`,
    `## 练习要求\n${input.question.prompt}`,
    "",
    "## 本类严师要点",
    hints,
    "",
    "## 输出 schema",
    JSON.stringify(
      {
        overallScore: 72,
        strengths: ["具体优点1", "优点2"],
        improvements: ["可改点1", "可改点2"],
        exampleRewrite: "不超过150字的示范段落",
        nextStep: "一句可执行的下一步"
      },
      null,
      2
    ),
    "",
    "## 用户练习稿",
    input.userText.trim(),
    "",
    "现在输出 JSON（overallScore 为 0–100 整数）："
  ].join("\n");
}
