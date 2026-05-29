import React, { useMemo, useState } from "react";
import type { TrainingAttempt, TrainingTreeCategory } from "../../api";

export function TrainingRecordsPage(props: {
  categories: TrainingTreeCategory[];
  attempts: TrainingAttempt[];
  onOpenAttempt: (attemptId: string, questionId: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"byQuestion" | "byTime">("byQuestion");

  const catTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of props.categories) m.set(c.id, c.title);
    return m;
  }, [props.categories]);

  const qTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of props.categories) {
      for (const q of c.questions) m.set(q.id, q.title);
    }
    return m;
  }, [props.categories]);

  const byQuestion = useMemo(() => {
    const map = new Map<string, TrainingAttempt[]>();
    for (const a of props.attempts) {
      const arr = map.get(a.questionId) ?? [];
      arr.push(a);
      map.set(a.questionId, arr);
    }
    return [...map.entries()].map(([questionId, attempts]) => ({
      questionId,
      attempts: attempts.sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    }));
  }, [props.attempts]);

  const byTime = useMemo(
    () => [...props.attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [props.attempts]
  );

  return (
    <div className="trainingRecordsPage">
      <button type="button" className="btnSort" onClick={props.onBack}>
        ← 返回训练
      </button>
      <h2 className="trainingLessonTitle">练习记录</h2>
      <div className="browserTabsBar" role="tablist">
        <div className="browserTabsStrip">
          <button
            type="button"
            role="tab"
            className={`browserTab ${tab === "byQuestion" ? "active" : ""}`}
            onClick={() => setTab("byQuestion")}
          >
            按题目
          </button>
          <button
            type="button"
            role="tab"
            className={`browserTab ${tab === "byTime" ? "active" : ""}`}
            onClick={() => setTab("byTime")}
          >
            按时间
          </button>
        </div>
      </div>
      {tab === "byQuestion" ? (
        byQuestion.length === 0 ? (
          <p className="muted">暂无记录。</p>
        ) : (
          <ul className="trainingRecordsByQuestion">
            {byQuestion.map(({ questionId, attempts }) => (
              <li key={questionId} className="trainingRecordsGroup">
                <div className="trainingRecordsGroupTitle">
                  {catTitle.get(attempts[0]!.categoryId) ?? "题型"} · {qTitle.get(questionId) ?? questionId}
                </div>
                <ul>
                  {attempts.map((a, i) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="trainingHistoryItem"
                        onClick={() => props.onOpenAttempt(a.id, a.questionId)}
                      >
                        <span>
                          第 {attempts.length - i} 次 · {a.result.overallScore}/100
                        </span>
                        <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )
      ) : byTime.length === 0 ? (
        <p className="muted">暂无记录。</p>
      ) : (
        <ul className="trainingHistoryList">
          {byTime.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="trainingHistoryItem"
                onClick={() => props.onOpenAttempt(a.id, a.questionId)}
              >
                <span>
                  {catTitle.get(a.categoryId)} · {qTitle.get(a.questionId)} · {a.result.overallScore}/100
                </span>
                <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
