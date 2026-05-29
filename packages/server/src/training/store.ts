import fs from "node:fs/promises";
import path from "node:path";
import { listCategories } from "./categories.js";
import { getCategoryWithTeaching } from "./teaching.js";
import type {
  TrainingAttempt,
  TrainingGradingResult,
  TrainingQuestion,
  TrainingTree,
  TrainingTreeCategory,
  TrainingTreeQuestion
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

export async function saveQuestion(dataDir: string, input: Omit<TrainingQuestion, "id" | "createdAt"> & { id?: string }): Promise<TrainingQuestion> {
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
    return JSON.parse(raw) as TrainingQuestion;
  } catch {
    return null;
  }
}

export async function listQuestionsByCategory(dataDir: string, categoryId: string): Promise<TrainingQuestion[]> {
  const dir = questionsDir(dataDir);
  try {
    const files = await fs.readdir(dir);
    const out: TrainingQuestion[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const q = JSON.parse(raw) as TrainingQuestion;
        if (q.categoryId === categoryId) out.push(q);
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
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
        out.push(JSON.parse(raw) as TrainingQuestion);
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
    return JSON.parse(raw) as TrainingAttempt;
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
        out.push(JSON.parse(raw) as TrainingAttempt);
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

export function computeCategoryStats(attempts: TrainingAttempt[], categoryId: string) {
  const mine = attempts.filter((a) => a.categoryId === categoryId);
  return { attemptCount: mine.length };
}

export async function buildTrainingTree(dataDir: string): Promise<TrainingTree> {
  const attempts = await listAllAttempts(dataDir, 500);
  const categories: TrainingTreeCategory[] = await Promise.all(
    listCategories().map(async (cat) => {
      const full = await getCategoryWithTeaching(dataDir, cat.id);
      const catStats = computeCategoryStats(attempts, cat.id);
      const questions: TrainingTreeQuestion[] = [];
      return {
        ...full,
        attemptCount: catStats.attemptCount,
        questionCount: 0,
        questions
      };
    })
  );

  const byCat = new Map(categories.map((c) => [c.id, c]));
  for (const q of await listAllQuestions(dataDir)) {
    const cat = byCat.get(q.categoryId);
    if (!cat) continue;
    const stats = computeQuestionStats(attempts, q.id);
    cat.questions.push({ ...q, ...stats });
    cat.questionCount += 1;
  }

  for (const cat of categories) {
    cat.questions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return { categories };
}

export type { TrainingGradingResult };
