import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTrainingTree,
  computeQuestionStats,
  listAttemptsByQuestion,
  listQuestionsByScene,
  saveAttempt,
  saveQuestion
} from "./store.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-training-scene-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("training scene store", () => {
  it("saves question and lists by scene", async () => {
    await saveQuestion(tmp, {
      sceneId: "scene-dialogue-daily",
      title: "测试题",
      prompt: "写对话",
      minChars: 50,
      maxChars: 300,
      source: "ai"
    });
    const list = await listQuestionsByScene(tmp, "scene-dialogue-daily");
    expect(list.length).toBe(1);
    expect(list[0]!.title).toBe("测试题");
  });

  it("saves multiple attempts and computes stats", async () => {
    const q = await saveQuestion(tmp, {
      sceneId: "scene-dialogue-daily",
      title: "Q1",
      prompt: "p",
      minChars: 10,
      maxChars: 100,
      source: "ai"
    });
    await saveAttempt(tmp, {
      questionId: q.id,
      sceneId: q.sceneId,
      text: "a",
      result: {
        overallScore: 60,
        attitudeDiagnosis: "认真但菜",
        sanityDamage: 70,
        soulCrushingMockery: "i",
        executionDetails: [{ crimeScene: "x", roast: "i" }],
        purgatoryPenalty: "n"
      },
      gradingMode: "honest",
      modelConfigId: "m1"
    });
    await saveAttempt(tmp, {
      questionId: q.id,
      sceneId: q.sceneId,
      text: "b",
      result: {
        overallScore: 75,
        attitudeDiagnosis: "认真但菜",
        sanityDamage: 30,
        soulCrushingMockery: "s",
        executionDetails: [{ crimeScene: "x", roast: "i" }],
        purgatoryPenalty: "n"
      },
      gradingMode: "honest",
      modelConfigId: "m1"
    });
    const attempts = await listAttemptsByQuestion(tmp, q.id);
    const s2 = computeQuestionStats(attempts, q.id);
    expect(s2.attemptCount).toBe(2);
    expect(s2.bestScore).toBe(75);
  });

  it("buildTreeStats aggregates scene attemptCount", async () => {
    const q = await saveQuestion(tmp, {
      sceneId: "scene-env",
      title: "R1",
      prompt: "p",
      minChars: 10,
      maxChars: 100,
      source: "ai"
    });
    await saveAttempt(tmp, {
      questionId: q.id,
      sceneId: q.sceneId,
      text: "x",
      result: {
        overallScore: 70,
        attitudeDiagnosis: "认真但菜",
        sanityDamage: 40,
        soulCrushingMockery: "i",
        executionDetails: [{ crimeScene: "x", roast: "i" }],
        purgatoryPenalty: "n"
      },
      gradingMode: "honest",
      modelConfigId: "m1"
    });
    const tree = await buildTrainingTree(tmp);
    const sceneGroup = tree.groups.find((g) => g.id === "group-scene-practice");
    const scene = sceneGroup?.scenes.find((s) => s.id === "scene-env");
    expect(scene?.attemptCount).toBe(1);
    expect(scene?.questions[0]?.attemptCount).toBe(1);
    expect(scene?.questions[0]?.bestScore).toBe(70);
    expect(sceneGroup?.title).toBe("场景练习");
    expect(tree.groups.some((g) => g.id === "group-technique")).toBe(true);
    expect(tree.groups.find((g) => g.id === "group-technique")?.scenes.length).toBe(7);
  });
});
