import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTrainingTree,
  computeQuestionStats,
  listAttemptsByQuestion,
  listQuestionsByCategory,
  saveAttempt,
  saveQuestion
} from "./store.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-training-v2-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("training v2 store", () => {
  it("saves question and lists by category", async () => {
    await saveQuestion(tmp, {
      categoryId: "cat-dialogue",
      title: "测试题",
      prompt: "写对话",
      minChars: 50,
      maxChars: 300,
      source: "ai"
    });
    const list = await listQuestionsByCategory(tmp, "cat-dialogue");
    expect(list.length).toBe(1);
    expect(list[0]!.title).toBe("测试题");
  });

  it("saves multiple attempts and computes stats", async () => {
    const q = await saveQuestion(tmp, {
      categoryId: "cat-dialogue",
      title: "Q1",
      prompt: "p",
      minChars: 10,
      maxChars: 100,
      source: "ai"
    });
    await saveAttempt(tmp, {
      questionId: q.id,
      categoryId: q.categoryId,
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
      categoryId: q.categoryId,
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

  it("buildTreeStats aggregates category attemptCount", async () => {
    const q = await saveQuestion(tmp, {
      categoryId: "cat-rhythm",
      title: "R1",
      prompt: "p",
      minChars: 10,
      maxChars: 100,
      source: "ai"
    });
    await saveAttempt(tmp, {
      questionId: q.id,
      categoryId: q.categoryId,
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
    const cat = tree.categories.find((c) => c.id === "cat-rhythm");
    expect(cat?.attemptCount).toBe(1);
    expect(cat?.questions[0]?.attemptCount).toBe(1);
    expect(cat?.questions[0]?.bestScore).toBe(70);
  });
});
