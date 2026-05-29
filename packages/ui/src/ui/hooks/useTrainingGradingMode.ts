import { useCallback, useState } from "react";
import {
  DEFAULT_TRAINING_GRADING_MODE,
  type TrainingGradingMode
} from "../components/training/gradingModeLabels";

const STORAGE_KEY = "novel-helper.trainingGradingMode";

function readStored(): TrainingGradingMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "infernal" || v === "strict" || v === "honest") return v;
  } catch {
    /* */
  }
  return DEFAULT_TRAINING_GRADING_MODE;
}

export function useTrainingGradingMode() {
  const [mode, setModeState] = useState<TrainingGradingMode>(() => readStored());

  const setMode = useCallback((next: TrainingGradingMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* */
    }
  }, []);

  return { mode, setMode };
}
