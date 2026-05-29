import { describe, expect, it } from "vitest";
import { parseTrainingGradingJson } from "./parseGrading.js";

const sampleInfernal = JSON.stringify({
  attitudeDiagnosis: "像卡了 Bug 的复读机一样敷衍。",
  sanityDamage: 99,
  soulCrushingMockery: "你的键盘是不是被胶水粘住了，只会复制粘贴？",
  executionDetails: [
    {
      crimeScene: "他很愤怒。他很愤怒。",
      roast: "你哪怕在键盘上撒把米，鸡啄出来的节奏都比你这种复制粘贴有画面感！"
    }
  ],
  overallScore: 0,
  purgatoryPenalty: "对着墙壁大喊十遍我不是复读机，然后手抄原题。"
});

describe("parseTrainingGradingJson", () => {
  it("parses infernal torture JSON", () => {
    const r = parseTrainingGradingJson(sampleInfernal);
    expect(r.overallScore).toBe(0);
    expect(r.sanityDamage).toBe(99);
    expect(r.executionDetails[0]?.crimeScene).toContain("愤怒");
    expect(r.soulCrushingMockery).toContain("复制粘贴");
  });

  it("migrates pathology JSON", () => {
    const legacy = JSON.stringify({
      vitalSigns: { editorNauseaLevel: 9, toxicWordCount: 12 },
      auditReports: {
        causalAnchorStatus: "情绪转折无铺垫。",
        characterFingerprint: "甲乙行为可互换。"
      },
      microscopicDismemberment: {
        targetSentence: "他很愤怒。",
        pathologyAnalysis: "典型告知体。",
        surgicalAmputation: "甲下颌绷紧。"
      },
      overallScore: 14,
      respecGuide: "删光形容词。"
    });
    const r = parseTrainingGradingJson(legacy);
    expect(r.overallScore).toBe(14);
    expect(r.attitudeDiagnosis).toContain("情绪");
    expect(r.purgatoryPenalty).toBe("删光形容词。");
  });

  it("migrates devil-editor format", () => {
    const legacy = JSON.stringify({
      overallScore: 72,
      strengths: ["动词准"],
      improvements: ["告知体"],
      exampleRewrite: "改后",
      nextStep: "再练"
    });
    const r = parseTrainingGradingJson(legacy);
    expect(r.overallScore).toBe(72);
    expect(r.purgatoryPenalty).toBe("再练");
  });
});
