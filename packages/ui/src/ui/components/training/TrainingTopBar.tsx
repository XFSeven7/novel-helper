import React from "react";

export function TrainingTopBar(props: {
  onExit: () => void;
  onOpenHistory?: () => void;
  showHistory?: boolean;
}) {
  return (
    <header className="topbar trainingTopbar">
      <button type="button" className="btnSort" onClick={props.onExit}>
        返回写作
      </button>
      <span className="trainingTopbarTitle">网文写作训练</span>
      <div className="topbarRight">
        {props.onOpenHistory ? (
          <button type="button" className="btnSort" onClick={props.onOpenHistory}>
            {props.showHistory ? "学习路径" : "练习记录"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
