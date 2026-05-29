import React, { useEffect, useRef } from "react";
import type { TrainingGradingMode, TrainingGradingResult, TrainingQuestion } from "../../api";
import {
  TRAINING_GRADING_MODE_META,
  gradingModeUiLabels,
  resolveTrainingGradingMode
} from "./gradingModeLabels";
import { normalizeGradingResult } from "./normalizeGradingResult";

export function TrainingGradingView(props: {
  open: boolean;
  question: TrainingQuestion;
  result: TrainingGradingResult;
  gradingMode?: TrainingGradingMode | null;
  answerText?: string | null;
  onClose: () => void;
  onRetry: () => void;
  onViewHistory?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const r = normalizeGradingResult(props.result);
  const mode = resolveTrainingGradingMode(props.gradingMode);
  const labels = gradingModeUiLabels(mode);

  useEffect(() => {
    if (!props.open) return;
    const t = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="modalBackdrop modalBackdropTrainingGrading"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="modalPanel modalPanelOpaque modalPanelTrainingGrading"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-grading-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="trainingGradingModalHead">
          <div className="trainingGradingModalHeadMain">
            <h2 id="training-grading-title" className="modalHeading trainingGradingModalTitle">
              {props.question.title} · {labels.reportTitle}
            </h2>
            <p className="muted trainingGradingHint">
              {TRAINING_GRADING_MODE_META[mode].label}：{labels.hint}
            </p>
          </div>
          <div className="trainingGradingModalHeadScore" aria-label={`总分 ${r.overallScore} 分`}>
            <span className="trainingGradingScore">{r.overallScore}</span>
            <span className="trainingGradingScoreUnit">/100</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btnSort trainingGradingModalClose"
            onClick={props.onClose}
            aria-label="关闭评改报告"
          >
            关闭
          </button>
        </header>

        <div className="trainingGradingModalBody">
          {props.answerText?.trim() ? (
            <section className="trainingGradingSection trainingGradingAnswerSection">
              <h3>我的作答</h3>
              <pre className="trainingAttemptText">{props.answerText.trim()}</pre>
            </section>
          ) : null}

          <section className="trainingGradingSection">
            <h3>{labels.attitude}</h3>
            <p>{r.attitudeDiagnosis}</p>
            <p className="muted">
              {labels.sanity} {r.sanityDamage}/100
            </p>
          </section>

          <section className="trainingGradingSection">
            <h3>{labels.mockery}</h3>
            <p className="trainingSoulCrushing">{r.soulCrushingMockery}</p>
          </section>

          <section className="trainingGradingSection">
            <h3>{labels.execution}</h3>
            <ul className="trainingExecutionList">
              {r.executionDetails.map((d, i) => (
                <li key={i} className="trainingFatalFlawItem">
                  {d.crimeScene ? (
                    <blockquote className="trainingFatalFlawQuote">{d.crimeScene}</blockquote>
                  ) : null}
                  <p>{d.roast}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="trainingGradingSection trainingRespecGuide">
            <h3>{labels.penalty}</h3>
            <p className="trainingNextStep">{r.purgatoryPenalty}</p>
          </section>
        </div>

        <footer className="modalActions trainingGradingModalActions">
          <button type="button" className="btnModalPrimary" onClick={props.onClose}>
            返回题型树
          </button>
          <button type="button" className="btnModalSecondary" onClick={props.onRetry}>
            再练一次
          </button>
          {props.onViewHistory ? (
            <button type="button" className="btnModalSecondary" onClick={props.onViewHistory}>
              查看历次
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
