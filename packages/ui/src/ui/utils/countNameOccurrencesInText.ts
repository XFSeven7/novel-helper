/** 统计名字在正文中非重叠出现次数（本地 substring 匹配） */
export function countNameOccurrencesInText(content: string, name: string): number {
  const text = String(content || "");
  const needle = String(name || "").trim();
  if (!needle || !text) return 0;
  let count = 0;
  let idx = 0;
  while (idx <= text.length) {
    const i = text.indexOf(needle, idx);
    if (i < 0) break;
    count++;
    idx = i + needle.length;
  }
  return count;
}
