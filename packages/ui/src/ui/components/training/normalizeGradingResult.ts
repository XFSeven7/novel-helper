import type { TrainingGradingResult, TrainingExecutionDetail } from "../../api";

type LegacyPathology = {
  overallScore: number;
  vitalSigns?: { editorNauseaLevel: number; toxicWordCount?: number };
  auditReports?: { causalAnchorStatus: string; characterFingerprint: string };
  microscopicDismemberment?: {
    targetSentence?: string;
    pathologyAnalysis: string;
    surgicalAmputation?: string;
  };
  respecGuide?: string;
};

type LegacyDevil = {
  overallScore: number;
  diagnosticThinking?: string;
  improvements?: string[];
  fatalFlaws?: { quote?: string; critique: string }[];
  nextStep?: string;
  exampleRewrite?: string;
};

function detailsFromPathology(p: LegacyPathology): TrainingExecutionDetail[] {
  const micro = p.microscopicDismemberment;
  if (!micro) {
    return [{ crimeScene: "（全文）", roast: "旧版评改，细节缺失。" }];
  }
  const out: TrainingExecutionDetail[] = [
    {
      crimeScene: micro.targetSentence?.trim() || "（全文）",
      roast: micro.pathologyAnalysis
    }
  ];
  if (micro.surgicalAmputation?.trim()) {
    out.push({
      crimeScene: micro.targetSentence?.trim() || "（改写）",
      roast: micro.surgicalAmputation
    });
  }
  return out;
}

function fromPathology(p: LegacyPathology): TrainingGradingResult {
  const nausea = p.vitalSigns?.editorNauseaLevel ?? Math.min(10, Math.max(1, Math.round((100 - p.overallScore) / 10)));
  return {
    attitudeDiagnosis:
      p.auditReports?.causalAnchorStatus?.trim() || "态度未明（旧版病理报告）。",
    sanityDamage: Math.min(100, nausea * 10),
    soulCrushingMockery:
      p.microscopicDismemberment?.pathologyAnalysis?.trim() ||
      p.auditReports?.characterFingerprint?.trim() ||
      "旧版病理报告。",
    executionDetails: detailsFromPathology(p),
    overallScore: p.overallScore,
    purgatoryPenalty: p.respecGuide?.trim() || "请重新提交以获取无间判词。"
  };
}

function fromDevil(d: LegacyDevil): TrainingGradingResult {
  const flaws = d.fatalFlaws ?? [];
  const details: TrainingExecutionDetail[] =
    flaws.length > 0
      ? flaws.map((f) => ({
          crimeScene: f.quote?.trim() || "（未摘录）",
          roast: f.critique
        }))
      : (d.improvements ?? []).map((roast) => ({ crimeScene: "（全文）", roast }));
  return {
    attitudeDiagnosis: d.diagnosticThinking?.trim() || "认真但菜（旧版评改）。",
    sanityDamage: Math.min(100, Math.max(0, 100 - d.overallScore)),
    soulCrushingMockery: d.improvements?.join("；") || flaws[0]?.critique || "旧版评改。",
    executionDetails: details.length
      ? details
      : [{ crimeScene: "（全文）", roast: "旧版评改，无明细。" }],
    overallScore: d.overallScore,
    purgatoryPenalty: d.nextStep?.trim() || d.exampleRewrite?.trim() || "请重新提交。"
  };
}

export function normalizeGradingResult(raw: TrainingGradingResult): TrainingGradingResult {
  if (raw.soulCrushingMockery?.trim() && raw.attitudeDiagnosis?.trim()) {
    return raw;
  }
  const r = raw as TrainingGradingResult & LegacyPathology & LegacyDevil;
  if (r.vitalSigns || r.auditReports || r.microscopicDismemberment) {
    return fromPathology(r);
  }
  if (r.improvements || r.fatalFlaws) {
    return fromDevil(r);
  }
  return raw;
}
