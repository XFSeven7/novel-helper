/** 段首两个汉字空位（全角空格） */
const PARA_INDENT = "　　";

function expandSoftBreaks(raw: string): string {
  return (raw || "").replace(/\r/g, "").replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
}

function isSceneBreak(t: string): boolean {
  const s = t.trim();
  return /^[-—－_*＊·•]{3,}\s*$/.test(s) || s === "***" || s === "* * *";
}

function stripMarkdownHeading(p: string): string {
  return p.replace(/^#{1,6}\s+/, "").trim();
}

function hasParagraphIndent(s: string): boolean {
  return /^[\u3000\u2003]/.test(s) || /^ {2,}/.test(s);
}

function ensureParagraphIndent(s: string): string {
  const t = s.trim();
  if (!t || hasParagraphIndent(t)) return t;
  return `${PARA_INDENT}${t}`;
}

/**
 * 本地排版：分段并在每段段首补两个全角空格（场景分隔行除外）。
 * 不调用 AI，不改字词，仅调整段落与段首缩进。
 */
export function applyLocalMobileLayout(raw: string): string {
  const normalized = expandSoftBreaks(raw).trim();
  if (!normalized) return "";

  const paragraphs = normalized
    .split(/\n{2,}/g)
    .map((s) => s.trim().replace(/\n+/g, ""))
    .filter(Boolean);

  const lines = paragraphs.map((p) => {
    if (isSceneBreak(p)) return p.trim();
    const body = stripMarkdownHeading(p);
    return ensureParagraphIndent(body);
  });

  return lines.join("\n\n");
}
