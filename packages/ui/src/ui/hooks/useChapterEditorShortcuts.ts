import { useEffect, type RefObject } from "react";
import { insertAtSelection } from "../utils/textareaEdit";

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
  chapterContent,
  setChapterContent,
  textareaRef,
  onOpenFindReplace
}: {
  enabled: boolean;
  chapterContent: string;
  setChapterContent: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOpenFindReplace: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (isForeignInput(e.target)) return;

      if (e.altKey && e.shiftKey && e.code === "Enter") {
        const el = textareaRef.current;
        if (!el) return;
        e.preventDefault();
        const { text, selectionStart, selectionEnd } = insertAtSelection(
          chapterContent,
          el.selectionStart,
          el.selectionEnd,
          "\n"
        );
        setChapterContent(text);
        queueMicrotask(() => {
          el.focus();
          el.setSelectionRange(selectionStart, selectionEnd);
        });
        return;
      }

      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyR") {
        e.preventDefault();
        onOpenFindReplace();
        queueMicrotask(() => textareaRef.current?.focus());
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, chapterContent, setChapterContent, textareaRef, onOpenFindReplace]);
}
