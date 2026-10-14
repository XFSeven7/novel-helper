export type MergedChapterInput = {
  chapterNo: number;
  title: string;
  content: string;
};

export function stripLeadingTitleHeading(content: string, title: string): string {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] === `# ${title}`) {
    let i = 1;
    if (lines[i] === "") i += 1;
    return lines.slice(i).join("\n");
  }
  return content.replace(/^\uFEFF/, "");
}

export function buildMergedBookTxt(chapters: MergedChapterInput[]): string {
  return chapters
    .map((c) => {
      const body = stripLeadingTitleHeading(c.content, c.title).replace(/\s+$/u, "");
      return `第${c.chapterNo}章 ${c.title}\n${body}`;
    })
    .join("\n\n");
}

export function sanitizeExportFilename(bookTitle: string): string {
  const safe = bookTitle.replace(/[\\/:*?"<>|]/g, "").trim();
  return safe ? `${safe}.txt` : "book.txt";
}
