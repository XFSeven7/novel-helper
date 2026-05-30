import fs from "node:fs/promises";
import path from "node:path";
import { listTechniqueCategories, COPYBOOK_CATEGORY_ID } from "./categories.js";
import { resolveTopicId } from "./legacy.js";
import { listScenes } from "./scenes.js";
import { getCategoryWithTeaching, getSceneWithTeaching } from "./teaching.js";
import type {
  TrainingAttempt,
  TrainingGradingResult,
  TrainingQuestion,
  TrainingTree,
  TrainingTreeGroup,
  TrainingTreeQuestion,
  TrainingTreeScene
} from "./types.js";

export function trainingDir(dataDir: string) {
  return path.join(dataDir, "_settings", "training");
}

function questionsDir(dataDir: string) {
  return path.join(trainingDir(dataDir), "questions");
}

function attemptsDir(dataDir: string) {
  return path.join(trainingDir(dataDir), "attempts");
}

export function newTrainingId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseQuestion(raw: unknown): TrainingQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as TrainingQuestion & { categoryId?: string };
  const sceneId = resolveTopicId(o);
  if (!sceneId) return null;
  return {
    id: o.id,
    sceneId,
    title: o.title,
    prompt: o.prompt,
    minChars: o.minChars,
    maxChars: o.maxChars,
    snippet: o.snippet,
    createdAt: o.createdAt,
    source: o.source
  };
}

function parseAttempt(raw: unknown): TrainingAttempt | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as TrainingAttempt & { categoryId?: string };
  const sceneId = resolveTopicId(o);
  if (!sceneId) return null;
  return {
    id: o.id,
    questionId: o.questionId,
    sceneId,
    text: o.text,
    result: o.result,
    gradingMode: o.gradingMode,
    modelConfigId: o.modelConfigId,
    createdAt: o.createdAt
  };
}

export async function saveQuestion(
  dataDir: string,
  input: Omit<TrainingQuestion, "id" | "createdAt"> & { id?: string }
): Promise<TrainingQuestion> {
  const q: TrainingQuestion = {
    ...input,
    id: input.id ?? newTrainingId("tq"),
    createdAt: new Date().toISOString()
  };
  await fs.mkdir(questionsDir(dataDir), { recursive: true });
  await fs.writeFile(path.join(questionsDir(dataDir), `${q.id}.json`), JSON.stringify(q, null, 2), "utf8");
  return q;
}

export async function readQuestion(dataDir: string, id: string): Promise<TrainingQuestion | null> {
  try {
    const raw = await fs.readFile(path.join(questionsDir(dataDir), `${id}.json`), "utf8");
    return parseQuestion(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function listQuestionsByScene(dataDir: string, sceneId: string): Promise<TrainingQuestion[]> {
  const all = await listAllQuestions(dataDir);
  return all.filter((q) => q.sceneId === sceneId);
}

export async function listAllQuestions(dataDir: string): Promise<TrainingQuestion[]> {
  const dir = questionsDir(dataDir);
  try {
    const files = await fs.readdir(dir);
    const out: TrainingQuestion[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const q = parseQuestion(JSON.parse(raw));
        if (q) out.push(q);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveAttempt(
  dataDir: string,
  input: Omit<TrainingAttempt, "id" | "createdAt">
): Promise<TrainingAttempt> {
  const attempt: TrainingAttempt = {
    ...input,
    id: newTrainingId("ta"),
    createdAt: new Date().toISOString()
  };
  await fs.mkdir(attemptsDir(dataDir), { recursive: true });
  await fs.writeFile(path.join(attemptsDir(dataDir), `${attempt.id}.json`), JSON.stringify(attempt, null, 2), "utf8");
  return attempt;
}

export async function readAttempt(dataDir: string, id: string): Promise<TrainingAttempt | null> {
  try {
    const raw = await fs.readFile(path.join(attemptsDir(dataDir), `${id}.json`), "utf8");
    return parseAttempt(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function listAttemptsByQuestion(dataDir: string, questionId: string): Promise<TrainingAttempt[]> {
  const all = await listAllAttempts(dataDir);
  return all.filter((a) => a.questionId === questionId);
}

export async function listAllAttempts(dataDir: string, limit = 200): Promise<TrainingAttempt[]> {
  const dir = attemptsDir(dataDir);
  try {
    const files = await fs.readdir(dir);
    const out: TrainingAttempt[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const a = parseAttempt(JSON.parse(raw));
        if (a) out.push(a);
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  } catch {
    return [];
  }
}

export function computeQuestionStats(attempts: TrainingAttempt[], questionId: string) {
  const mine = attempts.filter((a) => a.questionId === questionId);
  const scores = mine.map((a) => a.result.overallScore).filter((s) => typeof s === "number");
  return {
    attemptCount: mine.length,
    bestScore: scores.length ? Math.max(...scores) : null
  };
}

export function computeSceneStats(attempts: TrainingAttempt[], sceneId: string) {
  const mine = attempts.filter((a) => a.sceneId === sceneId);
  return { attemptCount: mine.length };
}

export async function buildTrainingTree(dataDir: string): Promise<TrainingTree> {
  const attempts = await listAllAttempts(dataDir, 500);

  const sceneItems: TrainingTreeScene[] = await Promise.all(
    listScenes().map(async (s) => {
      const full = await getSceneWithTeaching(dataDir, s.id);
      const stats = computeSceneStats(attempts, s.id);
      return {
        ...full,
        attemptCount: stats.attemptCount,
        questionCount: 0,
        questions: [] as TrainingTreeQuestion[]
      };
    })
  );

  const categoryItems: TrainingTreeScene[] = await Promise.all(
    listTechniqueCategories().map(async (c) => {
      const full = await getCategoryWithTeaching(dataDir, c.id);
      const stats = computeSceneStats(attempts, c.id);
      return {
        ...full,
        sceneBrief: "",
        attemptCount: stats.attemptCount,
        questionCount: 0,
        questions: [] as TrainingTreeQuestion[]
      };
    })
  );

  const copybookScene: TrainingTreeScene = await (async () => {
    const full = await getCategoryWithTeaching(dataDir, COPYBOOK_CATEGORY_ID);
    const stats = computeSceneStats(attempts, COPYBOOK_CATEGORY_ID);
    return {
      ...full,
      sceneBrief: "",
      attemptCount: stats.attemptCount,
      questionCount: 0,
      questions: [] as TrainingTreeQuestion[]
    };
  })();

  const sceneGroup: TrainingTreeGroup = {
    id: "group-scene-practice",
    title: "场景练习",
    scenes: sceneItems
  };
  const techniqueGroup: TrainingTreeGroup = {
    id: "group-technique",
    title: "文笔技法",
    scenes: categoryItems
  };
  const copybookGroup: TrainingTreeGroup = {
    id: "group-copybook",
    title: "抄书练习",
    scenes: [copybookScene]
  };

  const byScene = new Map(sceneGroup.scenes.map((s) => [s.id, s]));
  const byCat = new Map([
    ...techniqueGroup.scenes.map((s) => [s.id, s] as const),
    [copybookScene.id, copybookScene] as const
  ]);
  for (const q of await listAllQuestions(dataDir)) {
    const stats = computeQuestionStats(attempts, q.id);
    const node = byScene.get(q.sceneId) ?? byCat.get(q.sceneId);
    if (!node) continue;
    node.questions.push({ ...q, ...stats });
    node.questionCount += 1;
  }
  for (const node of [...sceneGroup.scenes, ...techniqueGroup.scenes, copybookScene]) {
    node.questions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return { groups: [sceneGroup, techniqueGroup, copybookGroup] };
}

export type { TrainingGradingResult };
