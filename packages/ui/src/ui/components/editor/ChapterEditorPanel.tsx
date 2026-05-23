import React, { useCallback, useEffect, useState } from "react";
import { appConfirm } from "../../dialog/dialog";
import { applyLocalMobileLayout } from "../../utils/localMobileLayout";
import { ChapterEditorContent, type ChapterEditorContentProps } from "./ChapterEditorContent";
import { clampMobileFontPx, readStoredMobileFontPx, storeMobileFontPx } from "./mobileFontSize";
import { useSyncScrollPair } from "../../hooks/useSyncScrollPair";
import { MobileRawView } from "./MobileRawView";
import { MobileTopToolbar } from "./MobileTopToolbar";

export type MobileLayoutControl = {
  busy: boolean;
  draft: string;
  original: string;
  onRun: () => void | Promise<void>;
};

type CompareRightSource = "local" | "ai" | null;

export type ChapterEditorPanelProps = ChapterEditorContentProps & {
  mobileReading: boolean;
  mobileViewport: { w: number; h: number };
  historyPaneOpen: boolean;
  historyPane: React.ReactNode | null;
  mobileLayout: MobileLayoutControl | null;
  onApplyMobileLayout: (text: string) => void;
  okModelCount: number;
};

export function ChapterEditorPanel({
  mobileReading,
  mobileViewport,
  historyPaneOpen,
  historyPane,
  textareaClassName,
  mobileLayout,
  onApplyMobileLayout,
  okModelCount,
  ...contentProps
}: ChapterEditorPanelProps) {
  const [mobileCompareOn, setMobileCompareOn] = useState(false);
  const [mobileFontPx, setMobileFontPx] = useState(readStoredMobileFontPx);
  const [compareOriginal, setCompareOriginal] = useState("");
  const [localCompareDraft, setLocalCompareDraft] = useState("");
  const [compareRightSource, setCompareRightSource] = useState<CompareRightSource>(null);

  useEffect(() => {
    if (!mobileReading) {
      setMobileCompareOn(false);
      setCompareOriginal("");
      setLocalCompareDraft("");
      setCompareRightSource(null);
    }
  }, [mobileReading]);

  useEffect(() => {
    setCompareOriginal("");
    setLocalCompareDraft("");
    setCompareRightSource(null);
    setMobileCompareOn(false);
  }, [contentProps.selectedChapter?.filename]);

  useEffect(() => {
    if (mobileLayout?.original) setCompareOriginal(mobileLayout.original);
  }, [mobileLayout?.original]);

  const changeFontSize = useCallback((delta: number) => {
    setMobileFontPx((prev) => {
      const next = clampMobileFontPx(prev + delta);
      storeMobileFontPx(next);
      return next;
    });
  }, []);

  const showHistory =
    historyPaneOpen && !mobileReading && !contentProps.polishModeOn && !contentProps.expandModeOn;

  const canCompare =
    mobileReading &&
    !contentProps.polishModeOn &&
    !contentProps.expandModeOn &&
    !contentProps.auditReadModeOn &&
    Boolean(mobileLayout);

  const runLocalLayout = useCallback(() => {
    const snap = compareOriginal || contentProps.chapterContent;
    setCompareOriginal(snap);
    setLocalCompareDraft(applyLocalMobileLayout(snap));
    setCompareRightSource("local");
    setMobileCompareOn(true);
  }, [compareOriginal, contentProps.chapterContent]);

  const startAiLayout = useCallback(async () => {
    if (!mobileLayout || contentProps.busy || mobileLayout.busy) return;
    if (!okModelCount) return;
    const snap = compareOriginal || contentProps.chapterContent;
    setCompareOriginal(snap);
    setCompareRightSource("ai");
    setMobileCompareOn(true);
    await mobileLayout.onRun();
  }, [mobileLayout, contentProps.busy, contentProps.chapterContent, compareOriginal, okModelCount]);

  const handleApply = async () => {
    const text =
      (compareRightSource === "ai" ? mobileLayout?.draft : localCompareDraft)?.trim() || "";
    if (!text || contentProps.busy || mobileLayout?.busy) return;
    const ok = await appConfirm({
      title: "应用排版",
      message:
        compareRightSource === "local"
          ? "将把本地排版结果（段首两字空位）写入本章正文，是否继续？"
          : "将把 AI 排版结果写入本章正文，是否继续？",
      confirmLabel: "应用",
      variant: "danger"
    });
    if (!ok) return;
    onApplyMobileLayout(text);
    setMobileCompareOn(false);
    setLocalCompareDraft("");
    setCompareRightSource(null);
  };

  const canApply =
    compareRightSource === "ai"
      ? Boolean(mobileLayout?.draft.trim())
      : compareRightSource === "local"
        ? Boolean(localCompareDraft.trim())
        : false;

  const leftText = compareOriginal || mobileLayout?.original || contentProps.chapterContent;

  const rightText = (() => {
    if (compareRightSource === "ai" && mobileLayout?.busy && !mobileLayout.draft) return "AI 排版中…";
    if (compareRightSource === "ai" && mobileLayout?.draft) return mobileLayout.draft;
    if (compareRightSource === "local" && localCompareDraft) return localCompareDraft;
    return "点击「本地排版」或「AI 排版」";
  })();

  const scrollSyncKey = `${contentProps.selectedChapter?.filename ?? ""}:${mobileCompareOn}:${compareRightSource}:${mobileFontPx}`;
  const { leftRef, rightRef } = useSyncScrollPair(
    Boolean(canCompare && mobileCompareOn && !showHistory),
    scrollSyncKey
  );

  if (showHistory && historyPane) {
    return <>{historyPane}</>;
  }

  const phoneStyle = {
    width: `${mobileViewport.w}px`,
    height: `${mobileViewport.h}px`
  };

  const editorContent = (
    <ChapterEditorContent
      {...contentProps}
      okModelCount={okModelCount}
      textareaClassName={mobileReading ? "mobileTextarea" : textareaClassName}
      mobileFontPx={mobileReading ? mobileFontPx : undefined}
    />
  );

  const rightLabel =
    compareRightSource === "ai"
      ? "AI 排版后"
      : compareRightSource === "local"
        ? "本地排版后"
        : "排版后";

  const layoutButtons = !canCompare ? null : (
    <>
      <button
        type="button"
        className="btnSort"
        disabled={contentProps.busy || mobileLayout?.busy}
        onClick={() => runLocalLayout()}
        title="段首补两个全角空格，不调用 AI"
      >
        本地排版
      </button>
      <button
        type="button"
        className="btnSort"
        disabled={contentProps.busy || mobileLayout?.busy || !okModelCount}
        onClick={() => void startAiLayout()}
        title={okModelCount ? "AI 优化分段与手机阅读版式" : "请先在设置中配置可用模型"}
      >
        AI 排版
      </button>
      {mobileCompareOn ? (
        <>
          {compareRightSource === "local" ? (
            <button
              type="button"
              className="btnSort"
              disabled={contentProps.busy || mobileLayout?.busy}
              onClick={() => runLocalLayout()}
            >
              重做本地
            </button>
          ) : (
            <button
              type="button"
              className="btnSort"
              disabled={contentProps.busy || mobileLayout?.busy || !okModelCount}
              onClick={() => void mobileLayout?.onRun()}
            >
              {mobileLayout?.busy ? "排版中…" : "重做 AI"}
            </button>
          )}
          <button
            type="button"
            className="btnSort mobileRelayoutApplyBtn"
            disabled={contentProps.busy || mobileLayout?.busy || !canApply}
            onClick={() => void handleApply()}
          >
            一键应用
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={contentProps.busy || mobileLayout?.busy}
            onClick={() => {
              setMobileCompareOn(false);
              setCompareRightSource(null);
            }}
          >
            关闭对比
          </button>
        </>
      ) : null}
    </>
  );

  if (mobileReading) {
    return (
      <div className="mobileStage">
        <div className="mobileStageInner">
          <MobileTopToolbar
            fontSizePx={mobileFontPx}
            onFontSizeChange={changeFontSize}
            disabled={contentProps.busy}
          >
            {layoutButtons}
          </MobileTopToolbar>

          {canCompare && mobileCompareOn ? (
            <div className="mobileCompare" role="group" aria-label="移动预览左右对比">
              <div className="mobileCompareCol">
                <div className="mobileCompareLabel">原文</div>
                <div className="mobilePhone" style={phoneStyle}>
                  <MobileRawView
                    ref={leftRef}
                    content={leftText}
                    className="mobileRawView"
                    fontSizePx={mobileFontPx}
                  />
                </div>
              </div>
              <div className="mobileCompareCol">
                <div className="mobileCompareLabel">{rightLabel}</div>
                <div className="mobilePhone" style={phoneStyle}>
                  <MobileRawView
                    ref={rightRef}
                    content={rightText}
                    className={`mobileRawView ${
                      compareRightSource === "ai" && mobileLayout?.busy ? "mobileRawViewPending" : ""
                    }`}
                    fontSizePx={mobileFontPx}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mobileSingleWrap">
              <div className="mobilePhone" style={phoneStyle}>
                {editorContent}
              </div>
            </div>
          )}

          {canCompare ? (
            <p className="mobileStageFootnote muted">
              {mobileCompareOn
                ? "本地：段首「　　」· AI：智能分段 · 一键应用写入正文"
                : "先「本地排版」或「AI 排版」进入左右对比"}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="chapterSplit">
      <div className="chapterSplitLeft">{editorContent}</div>
    </div>
  );
}
