import React from "react";
import { ChapterEditorContent, type ChapterEditorContentProps } from "./ChapterEditorContent";

export type ChapterEditorPanelProps = ChapterEditorContentProps & {
  mobileReading: boolean;
  mobileViewport: { w: number; h: number };
};

export function ChapterEditorPanel({ mobileReading, mobileViewport, textareaClassName, ...contentProps }: ChapterEditorPanelProps) {
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
