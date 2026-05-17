/** 停止输入约多久后写入磁盘(毫秒) */
export const AUTOSAVE_DEBOUNCE_MS = 900;

/** 允许在线改标题的文件名:`序号_任意标题.md` */
export const CHAPTER_TITLE_RENAME_FILE_RE = /^(\d+)_.+\.md$/;

/** 与服务端一致的近似字数(列表与编辑器共用) */
export function approximateWordCount(s: string): number {
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return zh + en;
}

export function normalizeChapterGapList(raw: number[]): number[] {
  return [...new Set(raw)].filter((n) => Number.isFinite(n) && n >= 1).sort((a, b) => a - b);
}

/** 展示用:「第 4 章、第 7 章」 */
export function formatMissingChapterList(gaps: number[]): string {
  return normalizeChapterGapList(gaps)
    .map((n) => `第 ${n} 章`)
    .join("、");
}

export function formatBookCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
