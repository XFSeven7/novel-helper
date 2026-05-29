import type { TrainingGradingMode } from "./gradingModes.js";

export type { TrainingGradingMode };

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

export type TrainingScene = {
  id: string;
  title: string;
  order: number;
  teachingFile: string;
  rubricHints: string[];
  exerciseDefaults: { minChars: number; maxChars: number };
  sceneBrief: string;
};

export type TrainingScenePublic = TrainingScene & {
  contentMarkdown: string;
};

export type TrainingTopicPublic = TrainingScenePublic | TrainingCategoryPublic;

export type TrainingChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type TrainingSceneChat = {
  sceneId: string;
  messages: TrainingChatMessage[];
  updatedAt: string;
};

export type TrainingQuestionSnippet = {
  title: string;
  body: string;
};

export type TrainingQuestion = {
  id: string;
  sceneId: string;
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
  sceneId: string;
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

export type TrainingTreeScene = TrainingScenePublic & {
  attemptCount: number;
  questionCount: number;
  questions: TrainingTreeQuestion[];
};

export type TrainingTreeGroup = {
  id: string;
  title: string;
  scenes: TrainingTreeScene[];
};

export type TrainingTree = {
  groups: TrainingTreeGroup[];
};
