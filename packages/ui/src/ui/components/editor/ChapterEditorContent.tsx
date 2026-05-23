import React from "react";
import {
  buildAuditTargets,
  diffChars,
  splitParagraphs,
  type AuditLinkTarget
} from "../../utils/auditDiff";
import { approximateWordCount } from "../../utils/chapterFormat";

export type AuditHoverState = {
  target: AuditLinkTarget;
  rect: { left: number; top: number; width: number; height: number };
} | null;

export type ChapterSelected = { bookSlug: string; filename: string } | null;

export type ChapterEditorContentProps = {
  busy: boolean;
  selectedChapter: ChapterSelected;
  chapterContent: string;
  setChapterContent: (value: string) => void;
  chapterTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  textareaClassName?: string;
  expandModeOn: boolean;
  setExpandModeOn: React.Dispatch<React.SetStateAction<boolean>>;
  expandBusy: boolean;
  expandDraft: string;
  setExpandDraft: React.Dispatch<React.SetStateAction<string>>;
  setExpandModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  polishModeOn: boolean;
  setPolishModeOn: React.Dispatch<React.SetStateAction<boolean>>;
  polishBusy: boolean;
  polishOriginal: string;
  polishDraft: string;
  setPolishPhase: React.Dispatch<React.SetStateAction<"idle" | "running" | "done" | "error">>;
  setPolishOriginal: React.Dispatch<React.SetStateAction<string>>;
  setPolishDraft: React.Dispatch<React.SetStateAction<string>>;
  onPolishSelectedChapter: () => void | Promise<void>;
  okModelCount: number;
  auditReadModeOn: boolean;
  auditReaderRootRef: React.RefObject<HTMLDivElement | null>;
  auditHover: AuditHoverState;
  setAuditHover: React.Dispatch<React.SetStateAction<AuditHoverState>>;
  auditCharactersIndex: any;
  auditPlacesIndex: any;
  auditOrgsIndex: any;
  timelineIndex: any;
  storyFiles: any;
  onJumpToOrganize: (
    tab: "chapterAnalysis" | "chapterEntities" | "auditCharacters" | "places" | "timeline" | "foreshadows" | "story" | "orgs",
    key: string
  ) => void;
};

export function ChapterEditorContent({
  busy,
  selectedChapter,
  chapterContent,
  setChapterContent,
  chapterTextareaRef,
  textareaClassName,
  expandModeOn,
  setExpandModeOn,
  expandBusy,
  expandDraft,
  setExpandDraft,
  setExpandModalOpen,
  polishModeOn,
  setPolishModeOn,
  polishBusy,
  polishOriginal,
  polishDraft,
  setPolishPhase,
  setPolishOriginal,
  setPolishDraft,
  onPolishSelectedChapter,
  okModelCount,
  auditReadModeOn,
  auditReaderRootRef,
  auditHover,
  setAuditHover,
  auditCharactersIndex,
  auditPlacesIndex,
  auditOrgsIndex,
  timelineIndex,
  storyFiles,
  onJumpToOrganize
}: ChapterEditorContentProps) {
  return (
    <>
{expandModeOn ? (
    <div className="polishSplit">
      <div className="polishHead">
        <div className="polishTitle">
          调整对照
          <span className="polishCounts muted">
            原文 {approximateWordCount(chapterContent)} 字 · 调整后 {approximateWordCount(expandDraft)} 字
          </span>
        </div>
        <div className="row">
          <button
            type="button"
            className="btnSort"
            disabled={busy || expandBusy}
            onClick={() => {
              setExpandModeOn(false);
              setExpandModalOpen(true);
            }}
            title="修改预计字数/说明并重新调整"
          >
            重新调整
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy || expandBusy || !expandDraft.trim()}
            onClick={() => {
              setChapterContent(expandDraft);
              setExpandModeOn(false);
              setExpandDraft("");
            }}
            title="用调整结果替换正文"
          >
            一键更换
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy || expandBusy}
            onClick={() => {
              setExpandModeOn(false);
              setExpandDraft("");
            }}
          >
            退出调整
          </button>
        </div>
      </div>
      <div className="polishCols">
        <div className="polishCol">
          <div className="polishColTitle muted">原文</div>
          <div className="polishText">{chapterContent}</div>
        </div>
        <div className="polishCol">
          <div className="polishColTitle muted">调整后</div>
          <div className="polishText">{expandDraft || (expandBusy ? "调整中..." : "-")}</div>
        </div>
      </div>
    </div>
) : polishModeOn ? (
    <div className="polishSplit">
      <div className="polishHead">
        <div className="polishTitle">
          纠错对照
          <span className="polishCounts muted">
            原文 {approximateWordCount(polishOriginal || chapterContent)} 字 · 纠错后{" "}
            {approximateWordCount(polishDraft)} 字
          </span>
        </div>
        <div className="row">
          <button
            type="button"
            className="btnSort"
            disabled={busy || polishBusy || !okModelCount}
            onClick={() => void onPolishSelectedChapter()}
            title={!okModelCount ? "请先在「设置」中配置模型并测试连接" : "重新纠错(覆盖右侧纠错稿)"}
          >
            重新纠错
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy || polishBusy || !polishDraft.trim()}
            onClick={() => {
              setChapterContent(polishDraft);
              setPolishModeOn(false);
              setPolishPhase("idle");
              setPolishOriginal("");
              setPolishDraft("");
            }}
            title="用右侧纠错稿替换正文"
          >
            一键更换
          </button>
        </div>
      </div>
      <div className="polishCols">
        <div className="polishCol">
          <div className="polishColTitle muted">原文</div>
          <div className="polishText">{polishOriginal || chapterContent}</div>
        </div>
        <div className="polishCol">
          <div className="polishColTitle muted">纠错后</div>
          <div className="polishDiffPreview" aria-label="纠错改动标记预览">
            {diffChars(polishOriginal || chapterContent, polishDraft).map((seg, idx) =>
              seg.t === "ins" ? (
                <span key={idx} className="polishDiffIns">
                  {seg.s}
                </span>
              ) : seg.t === "eq" ? (
                <span key={idx}>{seg.s}</span>
              ) : null
            )}
          </div>
        </div>
      </div>
    </div>
) : auditReadModeOn ? (
    <div ref={auditReaderRootRef} className="auditReader">
      {(() => {
        const paras = splitParagraphs(chapterContent);
        const targets = buildAuditTargets({
          auditCharactersIndex,
          auditPlacesIndex,
          auditOrgsIndex,
          timelineIndex,
          storyFiles
        });
        const terms = [...targets]
          .map((t) => ({ term: t.display, target: t }))
          .filter((x) => x.term.length >= 2)
          .sort((a, b) => b.term.length - a.term.length);
        const recent = new Map<string, number>();
        const N = 10;

        const renderPara = (text: string, pi: number) => {
          const hits: Array<{ start: number; end: number; target: AuditLinkTarget; term: string }> = [];
          const used: Array<{ start: number; end: number }> = [];
          const overlap = (s: number, e: number) =>
            used.some((u) => Math.max(u.start, s) < Math.min(u.end, e));

          for (const { term, target } of terms) {
            const last = recent.get(term);
            if (last !== undefined && pi - last < N) continue;
            const idx = text.indexOf(term);
            if (idx < 0) continue;
            const s = idx;
            const e = idx + term.length;
            if (overlap(s, e)) continue;
            hits.push({ start: s, end: e, target, term });
            used.push({ start: s, end: e });
            recent.set(term, pi);
          }
          hits.sort((a, b) => a.start - b.start);
          if (!hits.length) return <div className="auditPara">{text}</div>;

          const parts: React.ReactNode[] = [];
          let cursor = 0;
          for (const h of hits) {
            if (h.start > cursor)
              parts.push(<span key={`${pi}-${cursor}`}>{text.slice(cursor, h.start)}</span>);
            parts.push(
              <span
                key={`${pi}-${h.start}-${h.end}`}
                className={`auditLink auditLink_${h.target.kind}`}
                onMouseEnter={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setAuditHover({
                    target: h.target,
                    rect: { left: r.left, top: r.top, width: r.width, height: r.height }
                  });
                }}
                onMouseLeave={() => setAuditHover(null)}
                onClick={() => onJumpToOrganize(h.target.jump.tab, h.target.jump.key)}
                role="button"
                tabIndex={0}
                title={h.target.display}
              >
                {text.slice(h.start, h.end)}
              </span>
            );
            cursor = h.end;
          }
          if (cursor < text.length)
            parts.push(<span key={`${pi}-tail`}>{text.slice(cursor)}</span>);
          return <div className="auditPara">{parts}</div>;
        };

        return (
          <>
            {paras.length ? (
              paras.map((p, i) => <React.Fragment key={i}>{renderPara(p, i)}</React.Fragment>)
            ) : (
              <div className="muted auditPanelEmpty">暂无正文。</div>
            )}
          </>
        );
      })()}
      {auditHover ? (
        <div
          className="auditTooltip"
          style={{
            left: Math.min(window.innerWidth - 320, Math.max(10, auditHover.rect.left)),
            top: Math.min(
              window.innerHeight - 180,
              Math.max(10, auditHover.rect.top + auditHover.rect.height + 8)
            )
          }}
          onMouseLeave={() => setAuditHover(null)}
        >
          <div className="auditTooltipTitle">{auditHover.target.display}</div>
          <div className="auditTooltipBody">
            {auditHover.target.summaryLines.map((l, i) => (
              <div key={i} className="auditTooltipLine">
                {l}
              </div>
            ))}
          </div>
          <div className="auditTooltipActions">
            <button
              type="button"
              className="btnSort"
              onClick={() => onJumpToOrganize(auditHover.target.jump.tab, auditHover.target.jump.key)}
            >
              去内容整理查看
            </button>
          </div>
        </div>
      ) : null}
    </div>
) : (
    <textarea
      className={textareaClassName}
      ref={chapterTextareaRef}
      value={chapterContent}
      onChange={(e) => setChapterContent(e.target.value)}
      disabled={busy || !selectedChapter}
      placeholder="在左侧选择章节或新建章节后开始写作..."
    />
)}

    </>
  );
}
