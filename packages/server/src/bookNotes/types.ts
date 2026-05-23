export const BUILT_IN_NOTEBOOK_ID = "planning";
export const BUILT_IN_NOTEBOOK_NAME = "规划";
export const MAX_NOTE_CONTENT_LEN = 8000;

export type BookNotebook = {
  id: string;
  name: string;
  builtIn?: boolean;
  order: number;
};

export type BookNoteEntry = {
  id: string;
  notebookId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
};

export type BookNotesIndex = {
  version: 1;
  updatedAt: string;
  notebooks: BookNotebook[];
  entries: BookNoteEntry[];
};
