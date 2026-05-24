import React, { useEffect, useRef } from "react";
import type { TextRange } from "../../utils/chapterFindReplace";
import { isAltShiftEnter } from "../../utils/chapterEditorShortcutUtils";
import { buildFindHighlightHtml } from "../../utils/chapterFindHighlight";

export type ChapterFindHighlightState = {
  open: boolean;
  query: string;
  matches: TextRange[];
  activeMatch: TextRange | null;
};

export function ChapterTextareaWithFindHighlight({
  highlight,
  chapterContent,
  chapterTextareaRef,
  textareaClassName,
  mobileFontPx,
  busy,
  selectedChapter,
  onChange,
  shortcutsEnabled,
  onInsertNewline
}: {
  highlight: ChapterFindHighlightState | null;
  chapterContent: string;
  chapterTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  textareaClassName?: string;
  mobileFontPx?: number;
  busy: boolean;
  selectedChapter: unknown;
  onChange: (value: string) => void;
  shortcutsEnabled?: boolean;
  onInsertNewline?: () => void;
}) {
  const backdropRef = useRef<HTMLPreElement | null>(null);
  const showBackdrop = Boolean(
    highlight?.open && highlight.query.trim() && highlight.activeMatch && highlight.matches.length
  );

  const fontStyle = mobileFontPx
    ? { fontSize: `${mobileFontPx}px`, lineHeight: 1.85 }
    : undefined;

  useEffect(() => {
    const ta = chapterTextareaRef.current;
    const bd = backdropRef.current;
    if (!ta || !bd || !showBackdrop) return;

    const syncScroll = () => {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    };

    syncScroll();
    ta.addEventListener("scroll", syncScroll);
    return () => ta.removeEventListener("scroll", syncScroll);
  }, [chapterTextareaRef, showBackdrop, chapterContent, highlight?.activeMatch]);

  useEffect(() => {
    if (!showBackdrop) return;
    const ta = chapterTextareaRef.current;
    if (!ta || !highlight?.activeMatch) return;
    ta.setSelectionRange(highlight.activeMatch.start, highlight.activeMatch.end);
  }, [showBackdrop, highlight?.activeMatch, chapterTextareaRef]);

  const highlightHtml =
    showBackdrop && highlight
      ? buildFindHighlightHtml(chapterContent, highlight.matches, highlight.activeMatch)
      : "";

  return (
    <div className="chapterTextareaWrap">
      {showBackdrop ? (
        <pre
          ref={backdropRef}
          className={`chapterTextareaHighlight ${textareaClassName ?? ""}`}
          style={fontStyle}
          aria-hidden
          dangerouslySetInnerHTML={{ __html: highlightHtml }}
        />
      ) : null}
      <textarea
        className={`${textareaClassName ?? ""}${showBackdrop ? " chapterTextareaWithHighlight" : ""}`}
        style={fontStyle}
        ref={chapterTextareaRef}
        value={chapterContent}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy || !selectedChapter}
        placeholder="在左侧选择章节或新建章节后开始写作..."
        onKeyDown={(e) => {
          if (!shortcutsEnabled || !onInsertNewline) return;
          if (isAltShiftEnter(e.nativeEvent)) {
            e.preventDefault();
            e.stopPropagation();
            onInsertNewline();
          }
        }}
      />
    </div>
  );
}
