import { useEffect, type RefObject } from "react";
import {
  insertNewlineAtTextarea,
  isAltR,
  isAltShiftEnter
} from "../utils/chapterEditorShortcutUtils";

function isChapterEditorTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return true;
  if (el.closest(".chapterSplitLeft")) return true;
  if (el.closest(".mobilePhoneEditor")) return true;
  return false;
}

function isForeignInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
  if (el.closest(".chapterFindReplaceBar")) return false;
  return !isChapterEditorTarget(target);
}

export function useChapterEditorShortcuts({
  enabled,
  setChapterContent,
  textareaRef,
  onOpenFindReplace
}: {
  enabled: boolean;
  setChapterContent: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOpenFindReplace: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (isForeignInput(e.target)) return;

      if (isAltShiftEnter(e)) {
        const el = textareaRef.current;
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        insertNewlineAtTextarea(el, setChapterContent);
        return;
      }

      if (isAltR(e)) {
        e.preventDefault();
        e.stopPropagation();
        onOpenFindReplace();
        queueMicrotask(() => textareaRef.current?.focus());
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, setChapterContent, textareaRef, onOpenFindReplace]);
}
