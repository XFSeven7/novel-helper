import React from "react";
import type { TrainingGradingResult, TrainingQuestion } from "../../api";

export function TrainingGradingView(props: {
  question: TrainingQuestion;
  result: TrainingGradingResult;
  onBackToTree: () => void;
  onRetry: () => void;
  onViewHistory?: () => void;
}) {
  const r = props.result;
  return (
    <div className="trainingGrading">
      <h2 className="trainingLessonTitle">{props.question.title} · 评改结果</h2>
      <div className="trainingGradingScore">
        {r.overallScore}
        <span className="trainingGradingScoreUnit">/100</span>
      </div>
      <p className="muted trainingGradingHint">客观严师评分，70 分为及格线。</p>
      <section className="trainingGradingSection">
        <h3>亮点</h3>
        <ul>{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <section className="trainingGradingSection">
        <h3>待改进</h3>
        <ul>{r.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <section className="trainingGradingSection">
        <h3>示范改写</h3>
        <p className="trainingGradingRewrite">{r.exampleRewrite}</p>
      </section>
      <p className="muted">{r.nextStep}</p>
      <div className="trainingGradingActions">
        <button type="button" className="btnModalPrimary" onClick={props.onBackToTree}>
          返回题型树
        </button>
        <button type="button" className="btnSort" onClick={props.onRetry}>
          再练一次
        </button>
        {props.onViewHistory ? (
          <button type="button" className="btnSort" onClick={props.onViewHistory}>
            查看历次
          </button>
        ) : null}
      </div>
    </div>
  );
}
