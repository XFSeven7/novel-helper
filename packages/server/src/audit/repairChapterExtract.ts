import { formatZodError, parseChapterExtract, type ChapterExtract } from "./auditExtractSchema.js";

export function buildRepairChapterExtractPrompt(input: { invalidJson: string; zodError: string }) {
  return [
    "上一次输出不是合法 ChapterExtract JSON。",
    `校验错误: ${input.zodError}`,
    "请只输出修复后的 JSON（无 markdown、无解释、无代码块）。",
    "残缺输入如下：",
    input.invalidJson.slice(0, 8000)
  ].join("\n");
}

export async function parseChapterExtractWithRepair(
  jsonText: string,
  repair: (prompt: string) => Promise<string>,
  stripFence: (s: string) => string
): Promise<ChapterExtract> {
  try {
    return parseChapterExtract(jsonText);
  } catch (e1: any) {
    const zodError = String(e1?.message || e1);
    let raw = jsonText;
    try {
      raw = stripFence(await repair(buildRepairChapterExtractPrompt({ invalidJson: jsonText, zodError })));
    } catch (e2: any) {
      throw new Error(`${zodError}；修复重试失败: ${e2?.message || e2}`);
    }
    return parseChapterExtract(raw);
  }
}
