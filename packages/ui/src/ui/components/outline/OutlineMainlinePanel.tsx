import React, { useEffect, useState } from "react";
import type { BookOutline, OutlineIndex } from "../../api";
import { OutlineTextarea } from "./OutlineTextarea";

type MainlineStage = NonNullable<BookOutline["mainlineStages"]>[number];

export function OutlineMainlinePanel({
  book,
  disabled,
  onBookChange
}: {
  book: BookOutline;
  disabled: boolean;
  onBookChange: (book: BookOutline) => void;
}) {
  const stages = book.mainlineStages ?? [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (stages.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= stages.length) setActiveIndex(stages.length - 1);
  }, [stages.length, activeIndex]);

  const setStages = (next: MainlineStage[]) => {
    onBookChange({ ...book, mainlineStages: next.length ? next : undefined });
  };

  const resizeStageCount = (count: number) => {
    const n = Math.max(0, Math.min(24, Math.floor(Number.isFinite(count) ? count : 0)));
    let next = [...stages];
    while (next.length < n) {
      next.push({
        id: `stage-${Date.now()}-${next.length}`,
        label: "",
        chapterRange: "",
        note: ""
      });
    }
    if (next.length > n) next = next.slice(0, n);
    setStages(next);
  };

  const updateStage = (index: number, patch: Partial<MainlineStage>) => {
    setStages(stages.map((st, j) => (j === index ? { ...st, ...patch } : st)));
  };

  const activeIdx = stages.length > 0 ? Math.min(activeIndex, stages.length - 1) : 0;
  const activeStage = stages.length > 0 ? stages[activeIdx] : null;

  const goStage = (delta: number) => {
    const next = activeIdx + delta;
    if (next < 0 || next >= stages.length) return;
    setActiveIndex(next);
  };

  const removeStage = (index: number) => {
    if (stages.length <= 1) return;
    setStages(stages.filter((_, j) => j !== index));
    if (activeIndex >= index && activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  const stageKey = (st: MainlineStage, i: number) => st.id || `idx-${i}`;

  return (
    <div className="outlineForm">
      <p className="muted outlineHint outlineHintCompact">与规划向导同步；修改写入 outline.json。</p>
      <div className="bookSetupMainlineStickyNav">
        <div className="bookSetupMainlineToolbar">
          <span className="bookSetupMainlineToolbarTitle">阶段</span>
          <label className="bookSetupMainlineCountInline">
            <span className="bookSetupMainlineCountLabel">共</span>
            <input
              type="number"
              className="bookSetupMainlineCountInput"
              min={0}
              max={24}
              disabled={disabled}
              value={stages.length}
              aria-label="阶段数量"
              onChange={(e) => resizeStageCount(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="btnSort bookSetupMainlineAddBtn"
            disabled={disabled}
            onClick={() => {
              resizeStageCount(stages.length + 1);
              setActiveIndex(stages.length);
            }}
          >
            + 添加
          </button>
        </div>
        {stages.length > 0 ? (
          <div className="bookSetupMainlineChips" role="tablist" aria-label="阶段切换">
            {stages.map((st, i) => {
              const chipLabel = st.label?.trim() || "未命名";
              const selected = i === activeIdx;
              return (
                <button
                  key={stageKey(st, i)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={disabled}
                  className={`bookSetupMainlineChip${selected ? " bookSetupMainlineChipActive" : ""}`}
                  onClick={() => setActiveIndex(i)}
                >
                  <span className="bookSetupMainlineChipNum">第{i + 1}阶段</span>
                  <span className="bookSetupMainlineChipLabel">{chipLabel}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted bookSetupMainlineEmpty">暂无阶段。可在规划向导中设计，或在此添加。</p>
        )}
      </div>

      {activeStage ? (
        <div className="bookSetupStageRow bookSetupStageRowActive">
          <div className="bookSetupStageHead">
            <h4 className="bookSetupStageTitle">第 {activeIdx + 1} 阶段</h4>
            <div className="bookSetupStageActions">
              <button
                type="button"
                className="btnSort bookSetupStageActBtn"
                disabled={disabled || activeIdx === 0}
                onClick={() => goStage(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btnSort bookSetupStageActBtn"
                disabled={disabled || activeIdx >= stages.length - 1}
                onClick={() => goStage(1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btnSort bookSetupStageActBtn"
                disabled={disabled || stages.length <= 1}
                onClick={() => removeStage(activeIdx)}
              >
                删除
              </button>
            </div>
          </div>
          <label className="outlineLabel">阶段名</label>
          <input
            type="text"
            className="modalInput"
            disabled={disabled}
            value={activeStage.label}
            onChange={(e) => updateStage(activeIdx, { label: e.target.value })}
          />
          <label className="outlineLabel">章节范围（示意）</label>
          <input
            type="text"
            className="modalInput"
            disabled={disabled}
            placeholder="如 1-20"
            value={activeStage.chapterRange || ""}
            onChange={(e) => updateStage(activeIdx, { chapterRange: e.target.value })}
          />
          <label className="outlineLabel">剧情备注</label>
          <OutlineTextarea
            rows={4}
            disabled={disabled}
            value={activeStage.note || ""}
            onChange={(note) => updateStage(activeIdx, { note })}
          />
        </div>
      ) : null}
    </div>
  );
}
