import { z } from "zod";

export const TRAINING_GRADING_MODES = ["infernal", "strict", "honest"] as const;
export type TrainingGradingMode = (typeof TRAINING_GRADING_MODES)[number];

export const DEFAULT_TRAINING_GRADING_MODE: TrainingGradingMode = "honest";

export const TRAINING_GRADING_MODE_LABELS: Record<
  TrainingGradingMode,
  { label: string; short: string; description: string }
> = {
  infernal: {
    label: "无间地狱",
    short: "最严",
    description: "态度侦测 + 人身向嘲讽，敷衍可直接 0 分。适合抗压训练。"
  },
  strict: {
    label: "严师验稿",
    short: "严",
    description: "高标准、就文论文，刻薄但不对人。分数整体偏低。"
  },
  honest: {
    label: "如实评改",
    short: "正常",
    description: "实话实说，优点缺点都要具体，禁止空洞夸奖与画饼。"
  }
};

export const trainingGradingModeSchema = z.enum(TRAINING_GRADING_MODES);

export function parseTrainingGradingMode(raw: unknown): TrainingGradingMode {
  const r = trainingGradingModeSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_TRAINING_GRADING_MODE;
}
