import iconv from "iconv-lite";

export function decodeTextBuffer(buf: Buffer): { text: string; encoding: "utf-8" | "gbk" } {
  const utf8 = buf.toString("utf8");
  const replacementRatio = (utf8.match(/\uFFFD/g)?.length ?? 0) / Math.max(utf8.length, 1);
  if (replacementRatio < 0.01) {
    return { text: utf8.replace(/\r\n/g, "\n"), encoding: "utf-8" };
  }
  const gbk = iconv.decode(buf, "gbk");
  return { text: gbk.replace(/\r\n/g, "\n"), encoding: "gbk" };
}
