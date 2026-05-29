import type { TrainingGradingResult } from "../../api";
import { normalizeGradingResult } from "./normalizeGradingResult";

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 记录列表中分数后的一行简评 */
export function trainingGradingBrief(result: TrainingGradingResult): string {
  const r = normalizeGradingResult(result);
  if (r.soulCrushingMockery.trim()) {
    return truncate(r.soulCrushingMockery, 56);
  }
  if (r.attitudeDiagnosis.trim()) {
    return truncate(r.attitudeDiagnosis, 56);
  }
  return "（无简评）";
}
