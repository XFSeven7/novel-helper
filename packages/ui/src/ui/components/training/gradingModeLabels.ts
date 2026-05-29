export type TrainingGradingMode = "infernal" | "strict" | "honest";

export const TRAINING_GRADING_MODES: TrainingGradingMode[] = ["honest", "strict", "infernal"];

export const TRAINING_GRADING_MODE_META: Record<
  TrainingGradingMode,
  { label: string; short: string; description: string }
> = {
  infernal: {
    label: "无间地狱",
    short: "最严",
    description: "态度侦测 + 人身向嘲讽，敷衍可直接 0 分。"
  },
  strict: {
    label: "严师验稿",
    short: "严",
    description: "高标准、就文论文，刻薄但不对人。"
  },
  honest: {
    label: "如实评改",
    short: "正常",
    description: "实话实说，禁止空洞夸奖与画饼。"
  }
};

export const DEFAULT_TRAINING_GRADING_MODE: TrainingGradingMode = "honest";

export function resolveTrainingGradingMode(mode: TrainingGradingMode | undefined | null): TrainingGradingMode {
  if (mode && mode in TRAINING_GRADING_MODE_META) return mode;
  return DEFAULT_TRAINING_GRADING_MODE;
}

export function gradingModeUiLabels(mode: TrainingGradingMode) {
  switch (mode) {
    case "infernal":
      return {
        reportTitle: "无间地狱判词",
        hint: "敷衍/复读可直接 0 分；认真但菜多在 1–20 分。",
        attitude: "态度侦测",
        sanity: "精神污染指数",
        mockery: "灵魂碾碎式总评",
        execution: "处刑明细",
        penalty: "无间刑罚"
      };
    case "strict":
      return {
        reportTitle: "严师验稿报告",
        hint: "分数从严；只批文字，不批人。",
        attitude: "态度判定",
        sanity: "违和感指数",
        mockery: "总体判断",
        execution: "问题摘录",
        penalty: "改进任务"
      };
  }
  return {
    reportTitle: "如实评改",
    hint: "不捧杀、不灌鸡汤；优缺点须可对照原文。",
    attitude: "态度判定",
    sanity: "阅读挫败感",
    mockery: "综合评语",
    execution: "具体问题",
    penalty: "下一步建议"
  };
}
