import React from "react";
import { useTrainingWorkbenchSplit } from "../../hooks/useTrainingWorkbenchSplit";

export function TrainingWorkbenchSplit(props: {
  mode: "learn" | "practice";
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  const split = useTrainingWorkbenchSplit(props.mode);

  return (
    <div
      ref={split.containerRef}
      className={`trainingWorkbenchSplit${split.dragging ? " trainingWorkbenchSplit--dragging" : ""}`}
    >
      <div className="trainingWorkbenchPane trainingWorkbenchPane--center" style={{ flex: `${split.ratio} 1 0` }}>
        {props.center}
      </div>
      <div
        className="trainingSplitHandle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整面板宽度"
        onMouseDown={(e) => {
          e.preventDefault();
          split.startDrag(e);
        }}
      />
      <div className="trainingWorkbenchPane trainingWorkbenchPane--right" style={{ flex: `${1 - split.ratio} 1 0` }}>
        {props.right}
      </div>
    </div>
  );
}
