export type TextRange = { start: number; end: number };

export function findNextMatch(text: string, query: string, fromIndex: number): TextRange | null {
  if (!query) return null;
  const startAt = Math.max(0, fromIndex);
  const idx = text.indexOf(query, startAt);
  if (idx >= 0) return { start: idx, end: idx + query.length };
  if (startAt === 0) return null;
  const wrap = text.indexOf(query, 0);
  if (wrap >= 0) return { start: wrap, end: wrap + query.length };
  return null;
}

export function findPrevMatch(text: string, query: string, beforeIndex: number): TextRange | null {
  if (!query) return null;
  const endAt = Math.max(0, beforeIndex);
  const slice = text.slice(0, endAt);
  const idx = slice.lastIndexOf(query);
  if (idx >= 0) return { start: idx, end: idx + query.length };
  const wrap = text.lastIndexOf(query);
  if (wrap >= 0 && wrap >= endAt) return { start: wrap, end: wrap + query.length };
  return null;
}

export function replaceRange(text: string, range: TextRange, replacement: string): string {
  return text.slice(0, range.start) + replacement + text.slice(range.end);
}

export function replaceAllLiteral(text: string, query: string, replacement: string): string {
  if (!query) return text;
  return text.split(query).join(replacement);
}

/** 非重叠字面量匹配列表（与 replaceAllLiteral 计数一致） */
export function findAllLiteralMatches(text: string, query: string): TextRange[] {
  if (!query) return [];
  const matches: TextRange[] = [];
  let from = 0;
  while (from <= text.length) {
    const idx = text.indexOf(query, from);
    if (idx < 0) break;
    matches.push({ start: idx, end: idx + query.length });
    from = idx + query.length;
  }
  return matches;
}

/** 当前匹配在列表中的序号（1-based），未命中返回 0 */
export function matchIndexInList(matches: TextRange[], active: TextRange | null): number {
  if (!active || !matches.length) return 0;
  const i = matches.findIndex((m) => m.start === active.start && m.end === active.end);
  return i >= 0 ? i + 1 : 0;
}

/** 下一个匹配（最后一处后回到第一处） */
export function stepMatchNext(matches: TextRange[], active: TextRange | null): TextRange | null {
  if (!matches.length) return null;
  if (!active) return matches[0]!;
  const idx = matchIndexInList(matches, active);
  if (idx <= 0) return matches[0]!;
  const nextIdx = idx % matches.length;
  return matches[nextIdx]!;
}

/** 上一个匹配（第一处前回到最后一处） */
export function stepMatchPrev(matches: TextRange[], active: TextRange | null): TextRange | null {
  if (!matches.length) return null;
  if (!active) return matches[matches.length - 1]!;
  const idx = matchIndexInList(matches, active);
  if (idx <= 0) return matches[matches.length - 1]!;
  const prevIdx = (idx - 2 + matches.length) % matches.length;
  return matches[prevIdx]!;
}
