import type { BookOutline, ChapterPlan, OutlineIndex, VolumeOutline } from "../outlineStore.js";

export const BOOK_SETUP_STEP_IDS = [
  "intent",
  "scale",
  "logline",
  "synopsis",
  "mainline",
  "volumes",
  "chapterSkeleton",
  "meta",
  "review"
] as const;

export type BookSetupStepId = (typeof BOOK_SETUP_STEP_IDS)[number];

export type BookSetupChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BookSetupDraft = {
  version: 1;
  updatedAt: string;
  currentStep: BookSetupStepId;
  skippedSteps: BookSetupStepId[];
  visitedSteps: BookSetupStepId[];

  /** 已 commit 绑定的书；有值时自动同步到该书且不可再次 commit */
  linkedBookId?: string;

  title?: string;
  slug?: string;
  metaSynopsis?: string;

  concept?: string;
  genreNotes?: string;
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;

  outline: {
    book: BookOutline;
    volumes: VolumeOutline[];
    ungroupedFilenames: string[];
    chapterPlans: Record<string, ChapterPlan>;
  };

  missingFields: string[];
  nextQuestion?: string;
  readyToCreate: boolean;

  stepMessages: Partial<Record<BookSetupStepId, BookSetupChatMessage[]>>;
};

export type BookSetupChatSuggestion = {
  concept?: string;
  genreNotes?: string;
  targetWords?: number;
  targetChapters?: number;
  structureFramework?: string;
  title?: string;
  metaSynopsis?: string;
  logline?: string;
  synopsis?: BookOutline["synopsis"];
  mainlineStages?: BookOutline["mainlineStages"];
  volumes?: Array<{ title: string; order: number; synopsis?: string }>;
};

export type BookSetupChatResponse = {
  assistantMessage: string;
  nextQuestion?: string;
  missingFields?: string[];
  suggestion?: BookSetupChatSuggestion;
  draft?: BookSetupDraft;
};
