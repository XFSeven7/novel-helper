export type MobileReadBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "scene" }
  | { kind: "dialogue"; text: string }
  | { kind: "narrative"; text: string };

/** 仅用于移动预览展示：把软换行提升为段落，便于分段排版 */
function expandSoftBreaks(raw: string): string {
  return (raw || "").replace(/\r/g, "").replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
}

function isSceneBreak(t: string): boolean {
  const s = t.trim();
  return /^[-—－_*＊·•]{3,}\s*$/.test(s) || s === "***" || s === "* * *";
}

function parseHeading(p: string): { level: number; text: string } | null {
  const m = p.match(/^(#{1,6})\s+([\s\S]+)$/);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function isDialogueParagraph(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  if (/^[""「『“‘【（(—\-]/.test(s)) return true;
  if (/^[\u4e00-\u9fff·]{1,14}[说道问答喊叫嚷笑冷淡沉声低声冷声怒哼叹].{0,3}[：:][\s""「]/.test(s)) return true;
  const lines = s.split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((ln) => /^[""「『“‘]/.test(ln) || /[：:][\s""「]/.test(ln))) return true;
  return false;
}

function normalizeInline(text: string): string {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("");
}

export function parseMobileReadBlocks(raw: string): MobileReadBlock[] {
  const normalized = expandSoftBreaks(raw).trim();
  if (!normalized) return [];

  const chunks = normalized
    .split(/\n{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks: MobileReadBlock[] = [];
  for (const chunk of chunks) {
    const heading = parseHeading(chunk);
    if (heading) {
      blocks.push({ kind: "heading", level: heading.level, text: heading.text });
      continue;
    }
    if (isSceneBreak(chunk)) {
      blocks.push({ kind: "scene" });
      continue;
    }
    const text = normalizeInline(chunk);
    if (!text) continue;
    if (isDialogueParagraph(chunk)) {
      blocks.push({ kind: "dialogue", text });
    } else {
      blocks.push({ kind: "narrative", text });
    }
  }
  return blocks;
}
