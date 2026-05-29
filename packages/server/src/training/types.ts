export type TrainingCategory = {
  id: string;
  title: string;
  order: number;
  teachingFile: string;
  rubricHints: string[];
  exerciseDefaults: { minChars: number; maxChars: number };
};

export type TrainingCategoryPublic = TrainingCategory & {
  contentMarkdown: string;
};

export type TrainingChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type TrainingCategoryChat = {
  categoryId: string;
  messages: TrainingChatMessage[];
  updatedAt: string;
};

export type TrainingQuestionSnippet = {
  title: string;
  body: string;
};

import type { TrainingGradingMode } from "./gradingModes.js";

export type { TrainingGradingMode };

export type TrainingQuestion = {
  id: string;
  categoryId: string;
  title: string;
  prompt: string;
  minChars: number;
  maxChars: number;
  snippet?: TrainingQuestionSnippet;
  createdAt: string;
  source: "ai";
};

export type TrainingExecutionDetail = {
  crimeScene: string;
  roast: string;
};

export type TrainingGradingResult = {
  attitudeDiagnosis: string;
  sanityDamage: number;
  soulCrushingMockery: string;
  executionDetails: TrainingExecutionDetail[];
  overallScore: number;
  purgatoryPenalty: string;
};

export type TrainingAttempt = {
  id: string;
  questionId: string;
  categoryId: string;
  text: string;
  result: TrainingGradingResult;
  gradingMode: TrainingGradingMode;
  modelConfigId: string;
  createdAt: string;
};

export type TrainingTreeQuestion = TrainingQuestion & {
  attemptCount: number;
  bestScore: number | null;
};

export type TrainingTreeCategory = TrainingCategoryPublic & {
  attemptCount: number;
  questionCount: number;
  questions: TrainingTreeQuestion[];
};

export type TrainingTree = {
  categories: TrainingTreeCategory[];
};
