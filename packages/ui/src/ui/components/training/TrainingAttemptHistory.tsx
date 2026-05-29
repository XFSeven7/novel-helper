import React from "react";
import type { TrainingAttempt } from "../../api";
import { TRAINING_GRADING_MODE_META, resolveTrainingGradingMode } from "./gradingModeLabels";
import { trainingGradingBrief } from "./trainingGradingBrief";

export function TrainingAttemptHistory(props: {
  attempts: TrainingAttempt[];
  loading?: boolean;
  onOpenAttempt?: (attempt: TrainingAttempt) => void;
}) {
  const sorted = [...props.attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (props.loading) {
    return <p className="muted">加载历次练习…</p>;
  }
  if (!sorted.length) {
    return <p className="muted">暂无练习记录，提交后将显示历次作答。</p>;
  }

  return (
    <ul className="trainingAttemptHistory">
      {sorted.map((a, idx) => {
        const n = sorted.length - idx;
        const r = a.result;
        const brief = trainingGradingBrief(r);
        const modeLabel = TRAINING_GRADING_MODE_META[resolveTrainingGradingMode(a.gradingMode)].short;
        return (
          <li key={a.id} className="trainingAttemptHistoryItem">
            <button
              type="button"
              className="trainingHistoryItem"
              onClick={() => props.onOpenAttempt?.(a)}
              disabled={!props.onOpenAttempt}
            >
              <span className="trainingHistoryItemMain">
                <span>
                  第 {n} 次 · {r.overallScore}/100
                  <span className="muted trainingGradingModeTag"> · {modeLabel}</span>
                  <span className="trainingGradingBrief"> · {brief}</span>
                </span>
                <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
