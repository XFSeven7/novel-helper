import React from "react";
import {
  TRAINING_GRADING_MODE_META,
  TRAINING_GRADING_MODES,
  type TrainingGradingMode
} from "./gradingModeLabels";

export function TrainingGradingModePicker(props: {
  disabled?: boolean;
  busy?: boolean;
  busyMode?: TrainingGradingMode | null;
  canSubmit: boolean;
  onSubmit: (mode: TrainingGradingMode) => void;
}) {
  return (
    <div className="trainingGradingSubmitBar">
      <span className="trainingGradingSubmitBarLabel">评改</span>
      <div className="trainingGradingSubmitBtns" role="group" aria-label="选择评改模式并提交">
        {TRAINING_GRADING_MODES.map((id) => {
          const meta = TRAINING_GRADING_MODE_META[id];
          const isBusy = props.busy && props.busyMode === id;
          const isOtherBusy = props.busy && props.busyMode !== id;
          return (
            <button
              key={id}
              type="button"
              className={`trainingGradingSubmitBtn trainingGradingSubmitBtn--${id}${
                isBusy ? " trainingGradingSubmitBtn--busy" : ""
              }`}
              disabled={!props.canSubmit || props.disabled || isOtherBusy}
              title={meta.description}
              onClick={() => props.onSubmit(id)}
            >
              {isBusy ? "评改中…" : meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
