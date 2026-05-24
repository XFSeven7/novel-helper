import React, { createContext, useContext } from "react";
import type { OutlineAiMode, OutlineIndex } from "../api";
import { useOutline } from "../hooks/useOutline";

type OutlineBookContextValue = {
  bookId: string;
  outline: OutlineIndex | null;
  loading: boolean;
  saving: boolean;
  aiBusy: boolean;
  err: string;
  updateOutline: (updater: (prev: OutlineIndex) => OutlineIndex) => void;
  saveNow: (next: OutlineIndex) => Promise<void>;
  runAi: (input: {
    mode: OutlineAiMode;
    modelConfigId?: string | null;
    instruction?: string;
    volumeId?: string;
    chapterFilename?: string;
    options?: Record<string, unknown>;
  }) => Promise<{ preview: Partial<OutlineIndex> | { report: string }; warnings?: string[] }>;
  applyPreview: (
    preview: Partial<OutlineIndex> | { report: string },
    overwrite?: boolean
  ) => Promise<OutlineIndex | null>;
};

const OutlineBookContext = createContext<OutlineBookContextValue | null>(null);

export function OutlineBookProvider({
  bookId,
  refreshToken,
  children
}: {
  bookId: string | null;
  refreshToken?: number;
  children: React.ReactNode;
}) {
  const ctl = useOutline(bookId, refreshToken ?? 0);
  const value: OutlineBookContextValue = {
    bookId: bookId ?? "",
    outline: ctl.outline,
    loading: ctl.loading,
    saving: ctl.saving,
    aiBusy: ctl.aiBusy,
    err: ctl.err,
    updateOutline: ctl.updateOutline,
    saveNow: ctl.saveNow,
    runAi: ctl.runAi,
    applyPreview: ctl.applyPreview
  };
  return <OutlineBookContext.Provider value={value}>{children}</OutlineBookContext.Provider>;
}

export function useOutlineBook(): OutlineBookContextValue {
  const ctx = useContext(OutlineBookContext);
  if (!ctx) throw new Error("useOutlineBook must be used within OutlineBookProvider");
  return ctx;
}

export function useOptionalOutlineBook(): OutlineBookContextValue | null {
  return useContext(OutlineBookContext);
}
