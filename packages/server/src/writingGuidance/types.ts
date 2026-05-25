export const BUILT_IN_GUIDANCE_NOTEBOOK_ID = "default";
export const BUILT_IN_GUIDANCE_NOTEBOOK_NAME = "常用";
export const MAX_GUIDANCE_USER_MESSAGE_LEN = 4000;
/** @deprecated use MAX_GUIDANCE_SESSION_TURNS; kept for model trim */
export const MAX_GUIDANCE_SESSION_MESSAGES = 40;
export const MAX_GUIDANCE_SESSION_TURNS = 20;
export const MAX_GUIDANCE_MODEL_MESSAGES = 16;
export const DEFAULT_GUIDANCE_SESSION_TITLE = "新指导";

export type GuidanceNotebook = {
  id: string;
  name: string;
  builtIn?: boolean;
  order: number;
};

/** Flat message for model API only */
export type GuidanceMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type GuidanceTurnPart = {
  content: string;
  createdAt: string;
};

export type GuidanceTurn = {
  id: string;
  user: GuidanceTurnPart;
  assistant: GuidanceTurnPart;
  hidden?: boolean;
  starred?: boolean;
};

export type GuidanceSession = {
  id: string;
  notebookId: string;
  title: string;
  turns: GuidanceTurn[];
  starred?: boolean;
  /** 同一笔记本内的手动排序，越小越靠前 */
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type WritingGuidanceIndex = {
  version: 1 | 2;
  updatedAt: string;
  notebooks: GuidanceNotebook[];
  sessions: GuidanceSession[];
};
