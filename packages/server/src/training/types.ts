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

export type TrainingGradingResult = {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  exampleRewrite: string;
  nextStep: string;
};

export type TrainingAttempt = {
  id: string;
  questionId: string;
  categoryId: string;
  text: string;
  result: TrainingGradingResult;
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
