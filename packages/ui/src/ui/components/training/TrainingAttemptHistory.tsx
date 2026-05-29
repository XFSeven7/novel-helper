import React, { useState } from "react";
import type { TrainingAttempt } from "../../api";

export function TrainingAttemptHistory(props: {
  attempts: TrainingAttempt[];
  loading?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
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
        const open = openId === a.id;
        return (
          <li key={a.id} className="trainingAttemptHistoryItem">
            <button
              type="button"
              className="trainingAttemptHistoryHead"
              onClick={() => setOpenId(open ? null : a.id)}
            >
              <span>
                第 {n} 次 · {a.result.overallScore}/100
              </span>
              <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
            </button>
            {open ? (
              <div className="trainingAttemptHistoryBody">
                <h4>我的作答</h4>
                <pre className="trainingAttemptText">{a.text}</pre>
                <h4>批阅</h4>
                <ul>
                  {a.result.strengths.map((s, i) => (
                    <li key={`s${i}`}>{s}</li>
                  ))}
                </ul>
                <ul>
                  {a.result.improvements.map((s, i) => (
                    <li key={`i${i}`}>{s}</li>
                  ))}
                </ul>
                <p className="trainingGradingRewrite">{a.result.exampleRewrite}</p>
                <p className="muted">{a.result.nextStep}</p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
