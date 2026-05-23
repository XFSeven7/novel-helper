import React, { forwardRef, useMemo } from "react";

function paragraphsForDisplay(raw: string): string[] {
  const t = (raw || "").replace(/\r/g, "").trim();
  if (!t) return [];
  const expanded = t.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
  return expanded
    .split(/\n{2,}/g)
    .map((s) => s.trim().replace(/\n+/g, ""))
    .filter(Boolean);
}

function paraKind(text: string): "placeholder" | "scene" | "heading" | "body" {
  const s = text.trim();
  if (!s || s === "AI 排版中…" || s.startsWith("点击「")) return "placeholder";
  if (/^[-—－_*＊·•\s]{3,}$/.test(s) || /^\*\s*\*\s*\*$/.test(s)) return "scene";
  if (/^#{1,6}\s+/.test(s)) return "heading";
  return "body";
}

function displayText(text: string, kind: ReturnType<typeof paraKind>) {
  if (kind === "heading") return text.replace(/^#{1,6}\s+/, "").trim();
  return text;
}

/** 移动预览阅读区：分段展示，正文段首缩进 2 字 */
export const MobileRawView = forwardRef<
  HTMLDivElement,
  {
    content: string;
    className?: string;
    fontSizePx?: number;
  }
>(function MobileRawView({ content, className, fontSizePx }, ref) {
  const paragraphs = useMemo(() => paragraphsForDisplay(content), [content]);

  return (
    <div
      ref={ref}
      className={className}
      style={fontSizePx ? { fontSize: `${fontSizePx}px` } : undefined}
      aria-label="移动预览正文"
    >
      {paragraphs.length ? (
        paragraphs.map((p, i) => {
          const kind = paraKind(p);
          const cls =
            kind === "placeholder"
              ? "mobileRawPara mobileRawPlaceholder"
              : kind === "scene"
                ? "mobileRawPara mobileRawScene"
                : kind === "heading"
                  ? "mobileRawPara mobileRawHeading"
                  : "mobileRawPara";
          const text = displayText(p, kind);
          const hasLeadingSpaces = /^[\u3000\u2003]{2}/.test(text);
          const paraCls =
            kind === "body" && hasLeadingSpaces ? `${cls} mobileRawParaHasLeadingSpaces` : cls;
          return (
            <p key={i} className={paraCls}>
              {text}
            </p>
          );
        })
      ) : (
        <p className="mobileRawPara mobileRawPlaceholder muted">暂无正文</p>
      )}
    </div>
  );
});
