import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TrainingLessonMarkdown(props: { content: string }) {
  const text = props.content?.trim() || "";
  if (!text) {
    return <p className="muted">暂无学法内容。</p>;
  }

  return (
    <div className="trainingLessonContent trainingLessonMd">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
