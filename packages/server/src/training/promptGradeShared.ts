import type { TrainingQuestion } from "./types.js";

export function formatOriginalQuestion(question: TrainingQuestion, answerLabel = "作者作答"): string {
  const lines = [
    `【题目标题】${question.title}`,
    `【练习要求】\n${question.prompt.trim()}`,
    `【字数要求】${question.minChars}–${question.maxChars} 字（${answerLabel}实际字数见下方）`
  ];
  if (question.snippet?.body?.trim()) {
    lines.push(
      `【题目附带材料：${question.snippet.title?.trim() || "参考片段"}】\n${question.snippet.body.trim()}`
    );
  }
  return lines.join("\n\n");
}

export const GRADING_JSON_SCHEMA_EXAMPLE = JSON.stringify(
  {
    attitudeDiagnosis: "判定作答态度：认真练习 / 敷衍凑字 / 复读糊弄。",
    sanityDamage: 45,
    soulCrushingMockery: "总评：对本稿的整体判断（本字段在各模式下语气不同，但须具体、可核对）。",
    executionDetails: [
      {
        crimeScene: "摘录需指出的原句（无则写「（全文）」）",
        roast: "针对该句或该问题的具体批评（或改写方向）"
      }
    ],
    overallScore: 58,
    purgatoryPenalty: "可执行的下一步练习建议（infernal 模式可为惩罚任务，其余模式为改进任务）"
  },
  null,
  2
);

export function buildGradingPromptTail(input: {
  categoryTitle: string;
  originalQuestion: string;
  userAnswer: string;
  userCharCount: number;
  answerHeading: string;
  closingLine: string;
}): string {
  return `### 输出格式要求（严格 JSON，无 Markdown 代码块，无 JSON 之外任何字符）：
${GRADING_JSON_SCHEMA_EXAMPLE}

---
## 原题（完整题目，须对照出题意图；不要评改「原题」里的附带材料本身）

题型分类：${input.categoryTitle}

${input.originalQuestion}

---
## ${input.answerHeading}（仅此为用户${input.answerHeading.includes("罪证") ? "" : "提交"}内容；实际字数 ${input.userCharCount} 字）

"""
${input.userAnswer}
"""

${input.closingLine}`;
}
