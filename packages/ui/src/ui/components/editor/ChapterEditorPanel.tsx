import React, { useCallback, useEffect, useState } from "react";
import { appConfirm } from "../../dialog/dialog";
import { ChapterEditorContent, type ChapterEditorContentProps } from "./ChapterEditorContent";
import { clampMobileFontPx, readStoredMobileFontPx, storeMobileFontPx } from "./mobileFontSize";
import { MobileRawView } from "./MobileRawView";
import { MobileTopToolbar } from "./MobileTopToolbar";

export type MobileLayoutControl = {
  busy: boolean;
  draft: string;
  original: string;
  onRun: () => void | Promise<void>;
};

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

  useEffect(() => {
    if (!mobileReading) setMobileCompareOn(false);
  }, [mobileReading]);

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

  const startAiLayout = useCallback(async () => {
    if (!mobileLayout || contentProps.busy || mobileLayout.busy) return;
    if (!okModelCount) return;
    setMobileCompareOn(true);
    await mobileLayout.onRun();
  }, [mobileLayout, contentProps.busy, okModelCount]);

  const handleApply = async () => {
    const text = mobileLayout?.draft.trim() || "";
    if (!text || contentProps.busy || mobileLayout?.busy) return;
    const ok = await appConfirm({
      title: "应用排版",
      message: "将把 AI 排版结果写入本章正文（覆盖当前编辑器内容），是否继续？",
      confirmLabel: "应用",
      variant: "danger"
    });
    if (!ok) return;
    onApplyMobileLayout(text);
    setMobileCompareOn(false);
  };

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

  const leftText = mobileLayout?.original || contentProps.chapterContent;
  const rightText = mobileLayout?.busy && !mobileLayout.draft
    ? "AI 排版中…"
    : mobileLayout?.draft || "点击顶部「AI 排版」生成右侧预览";

  const layoutActions = !canCompare ? null : !mobileCompareOn ? (
    <button
      type="button"
      className="btnSort"
      disabled={contentProps.busy || mobileLayout?.busy || !okModelCount}
      onClick={() => void startAiLayout()}
      title={okModelCount ? "AI 排版并左右对比" : "请先在设置中配置可用模型"}
    >
      AI 排版
    </button>
  ) : (
    <>
      <button
        type="button"
        className="btnSort"
        disabled={contentProps.busy || mobileLayout?.busy || !okModelCount}
        onClick={() => void mobileLayout?.onRun()}
      >
        {mobileLayout?.busy ? "排版中…" : "重新生成"}
      </button>
      <button
        type="button"
        className="btnSort mobileRelayoutApplyBtn"
        disabled={contentProps.busy || mobileLayout?.busy || !mobileLayout?.draft.trim()}
        onClick={() => void handleApply()}
      >
        一键应用
      </button>
      <button
        type="button"
        className="btnSort"
        disabled={contentProps.busy || mobileLayout?.busy}
        onClick={() => setMobileCompareOn(false)}
      >
        关闭对比
      </button>
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
            {layoutActions}
          </MobileTopToolbar>

          {canCompare && mobileCompareOn ? (
            <div className="mobileCompare" role="group" aria-label="移动预览左右对比">
              <div className="mobileCompareCol">
                <div className="mobileCompareLabel">原文</div>
                <div className="mobilePhone" style={phoneStyle}>
                  <MobileRawView content={leftText} className="mobileRawView" fontSizePx={mobileFontPx} />
                </div>
              </div>
              <div className="mobileCompareCol">
                <div className="mobileCompareLabel">AI 排版后</div>
                <div className="mobilePhone" style={phoneStyle}>
                  <MobileRawView
                    content={rightText}
                    className={`mobileRawView ${mobileLayout?.busy ? "mobileRawViewPending" : ""}`}
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
              {!okModelCount
                ? "需先配置可用模型"
                : mobileCompareOn
                  ? "左右对比 · 段首缩进 2 字 · 字号两屏同步"
                  : "点击「AI 排版」进入左右对比"}
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
