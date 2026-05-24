import { insertLineBelowCursor, scrollTextareaToSelection } from "./textareaEdit";

export function isAltShiftEnter(e: KeyboardEvent): boolean {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;
  return e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter";
}

export function isAltR(e: KeyboardEvent): boolean {
  return e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyR";
}

export function insertNewlineAtTextarea(
  el: HTMLTextAreaElement,
  setChapterContent: (value: string) => void
) {
  const { text, selectionStart, selectionEnd } = insertLineBelowCursor(
    el.value,
    el.selectionStart
  );
  setChapterContent(text);
  queueMicrotask(() => {
    el.focus();
    el.setSelectionRange(selectionStart, selectionEnd);
    scrollTextareaToSelection(el);
  });
}
