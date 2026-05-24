import type { TextRange } from "./chapterFindReplace";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 为查找替换底衬层生成带 mark 的 HTML（非重叠区间） */
export function buildFindHighlightHtml(
  text: string,
  matches: TextRange[],
  active: TextRange | null
): string {
  if (!matches.length) return escapeHtml(text);

  const sorted = [...matches].sort((a, b) => a.start - b.start);
  let html = "";
  let pos = 0;

  for (const m of sorted) {
    if (m.start < pos) continue;
    html += escapeHtml(text.slice(pos, m.start));
    const isActive = Boolean(active && m.start === active.start && m.end === active.end);
    const cls = isActive ? "findHighlightActive" : "findHighlight";
    html += `<mark class="${cls}">${escapeHtml(text.slice(m.start, m.end))}</mark>`;
    pos = m.end;
  }

  html += escapeHtml(text.slice(pos));
  return html;
}
