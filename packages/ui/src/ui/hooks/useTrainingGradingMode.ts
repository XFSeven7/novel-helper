import { useCallback } from "react";
import {
  DEFAULT_TRAINING_GRADING_MODE,
  type TrainingGradingMode
} from "../components/training/gradingModeLabels";
import { useUiPrefField } from "../uiPrefs/UiPrefsContext";

function asMode(v: string | undefined): TrainingGradingMode {
  if (v === "infernal" || v === "strict" || v === "honest") return v;
  return DEFAULT_TRAINING_GRADING_MODE;
}

export function useTrainingGradingMode() {
  const [raw, setRaw] = useUiPrefField("trainingGradingMode", DEFAULT_TRAINING_GRADING_MODE);
  const mode = asMode(raw);
  const setMode = useCallback(
    (next: TrainingGradingMode) => {
      setRaw(next);
    },
    [setRaw]
  );

  return { mode, setMode };
}
