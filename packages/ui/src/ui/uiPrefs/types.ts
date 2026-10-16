export type UiPrefsLayout3Splits = {
  navW: number;
  guidanceW: number;
  rightW: number;
};

export type UiPrefsBookSlice = {
  writingGuidance?: {
    sortDesc?: boolean;
    activeNotebookId?: string;
    expandedSessionIds?: string[];
    showStarredOnly?: boolean;
  };
  notes?: {
    sortDesc?: boolean;
    collapsed?: Record<string, boolean>;
    activeNotebookId?: string;
  };
  outline?: {
    stageSplitRatio?: number;
    stageTreeExpandedIds?: string[];
  };
};

export type UiPrefsFile = {
  version: 1;
  navCollapsed?: boolean;
  rightCollapsed?: boolean;
  layout3Splits?: UiPrefsLayout3Splits;
  bookShelfSortDesc?: boolean;
  chapterSortDesc?: boolean;
  themeId?: string;
  shelfTab?: string;
  mobileFontPx?: number;
  mobilePhoneW?: number;
  trainingGradingMode?: string;
  trainingTreeNavWidth?: number;
  trainingSplitRatio?: {
    learn?: number;
    practice?: number;
    copybook?: number;
  };
  byBook?: Record<string, UiPrefsBookSlice>;
};

export type UiPrefsPatch = Partial<UiPrefsFile>;
