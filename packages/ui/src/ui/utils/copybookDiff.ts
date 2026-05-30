export type CopybookCharMark = { char: string; ok: boolean };

export function markCopybookChars(source: string, draft: string): CopybookCharMark[] {
  return [...draft].map((char, i) => ({ char, ok: char === source[i] }));
}

export function computeCopybookStats(source: string, draft: string) {
  const marks = markCopybookChars(source, draft);
  const errorCount = marks.filter((m) => !m.ok).length;
  const accuracy = draft.length === 0 ? 1 : (draft.length - errorCount) / draft.length;
  return { errorCount, accuracy, marks };
}
