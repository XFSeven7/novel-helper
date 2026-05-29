import React, { useMemo, useState } from "react";
import { allTreeScenes, resolveSceneTitle, type TrainingAttempt, type TrainingTree } from "../../api";
import { trainingGradingBrief } from "./trainingGradingBrief";

function AttemptRow(props: {
  label: string;
  time: string;
  score: number;
  brief: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="trainingHistoryItem" onClick={props.onClick}>
      <span className="trainingHistoryItemMain">
        <span>
          {props.label} · {props.score}/100
          <span className="trainingGradingBrief"> · {props.brief}</span>
        </span>
        <span className="muted">{props.time}</span>
      </span>
    </button>
  );
}

export function TrainingRecordsPage(props: {
  tree: TrainingTree;
  attempts: TrainingAttempt[];
  onOpenAttempt: (attemptId: string, questionId: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"byQuestion" | "byTime">("byQuestion");
  const scenes = useMemo(() => allTreeScenes(props.tree), [props.tree]);

  const sceneTitle = useMemo(
    () => (sceneId: string) => resolveSceneTitle(sceneId, props.tree),
    [props.tree]
  );

  const qTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of scenes) {
      for (const q of s.questions) m.set(q.id, q.title);
    }
    return m;
  }, [scenes]);

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
                  {sceneTitle(attempts[0]!.sceneId)} · {qTitle.get(questionId) ?? questionId}
                </div>
                <ul>
                  {attempts.map((a, i) => (
                    <li key={a.id}>
                      <AttemptRow
                        label={`第 ${attempts.length - i} 次`}
                        time={new Date(a.createdAt).toLocaleString()}
                        score={a.result.overallScore}
                        brief={trainingGradingBrief(a.result)}
                        onClick={() => props.onOpenAttempt(a.id, a.questionId)}
                      />
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
              <AttemptRow
                label={`${sceneTitle(a.sceneId)} · ${qTitle.get(a.questionId) ?? a.questionId}`}
                time={new Date(a.createdAt).toLocaleString()}
                score={a.result.overallScore}
                brief={trainingGradingBrief(a.result)}
                onClick={() => props.onOpenAttempt(a.id, a.questionId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
