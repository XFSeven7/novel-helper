/** 将 textarea 当前选区滚入可视区域 */
export function scrollTextareaToSelection(el: HTMLTextAreaElement) {
  const start = el.selectionStart;
  if (start == null) return;

  const textBefore = el.value.slice(0, start);
  const lineIndex = textBefore.split("\n").length - 1;
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.85 || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const lineTop = lineIndex * lineHeight + paddingTop;
  const margin = lineHeight * 2;
  const visibleTop = el.scrollTop;
  const visibleBottom = visibleTop + el.clientHeight;

  if (lineTop < visibleTop + margin) {
    el.scrollTop = Math.max(0, lineTop - margin);
  } else if (lineTop + lineHeight > visibleBottom - margin) {
    el.scrollTop = Math.max(0, lineTop - el.clientHeight + margin + lineHeight);
  }
}

export function insertAtSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string
): { text: string; selectionStart: number; selectionEnd: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const next = before + insert + after;
  const pos = before.length + insert.length;
  return { text: next, selectionStart: pos, selectionEnd: pos };
}

/** 在当前行末尾下方插入空行，光标移到新行（不拆行） */
export function insertLineBelowCursor(
  text: string,
  cursor: number
): { text: string; selectionStart: number; selectionEnd: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const nextNewline = text.indexOf("\n", at);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const next = text.slice(0, lineEnd) + "\n" + text.slice(lineEnd);
  const pos = lineEnd + 1;
  return { text: next, selectionStart: pos, selectionEnd: pos };
}
