import React from "react";
import { ChapterEditorContent, type ChapterEditorContentProps } from "./ChapterEditorContent";

export type ChapterEditorPanelProps = ChapterEditorContentProps & {
  mobileReading: boolean;
  mobileViewport: { w: number; h: number };
  historyPaneOpen: boolean;
  historyPane: React.ReactNode | null;
};

export function ChapterEditorPanel({
  mobileReading,
  mobileViewport,
  historyPaneOpen,
  historyPane,
  textareaClassName,
  ...contentProps
}: ChapterEditorPanelProps) {
  const showHistory =
    historyPaneOpen && !mobileReading && !contentProps.polishModeOn && !contentProps.expandModeOn;

  if (showHistory && historyPane) {
    return <>{historyPane}</>;
  }

  const content = (
    <ChapterEditorContent
      {...contentProps}
      textareaClassName={mobileReading ? "mobileTextarea" : textareaClassName}
    />
  );

  if (mobileReading) {
    return (
      <div className="mobileStage">
        <div
          className="mobilePhone"
          style={{ width: `${mobileViewport.w}px`, height: `${mobileViewport.h}px` }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="chapterSplit">
      <div className="chapterSplitLeft">{content}</div>
    </div>
  );
}
