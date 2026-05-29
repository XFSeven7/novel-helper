import React, { useState } from "react";

export function TrainingGenerateMenu(props: {
  disabled?: boolean;
  busy?: boolean;
  onGenerate: (count: 1 | 3 | 5) => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(count: 1 | 3 | 5) {
    setOpen(false);
    props.onGenerate(count);
  }

  return (
    <div className="trainingGenerateMenu">
      <button
        type="button"
        className="btnModalPrimary trainingGenerateBtn"
        disabled={props.disabled || props.busy}
        onClick={() => setOpen((v) => !v)}
      >
        {props.busy ? "出题中…" : "生成题目 ▾"}
      </button>
      {open && !props.disabled ? (
        <div className="trainingGenerateDropdown" role="menu">
          <button type="button" className="trainingGenerateOption" onClick={() => pick(1)}>
            生成 1 道
          </button>
          <button type="button" className="trainingGenerateOption" onClick={() => pick(3)}>
            生成 3 道
          </button>
          <button type="button" className="trainingGenerateOption" onClick={() => pick(5)}>
            生成 5 道
          </button>
        </div>
      ) : null}
    </div>
  );
}
