import React, { useMemo, useState } from "react";
import type { TrainingTreeCategory } from "../../api";

export type TrainingSelection =
  | { kind: "category"; categoryId: string }
  | { kind: "question"; categoryId: string; questionId: string };

type Props = {
  categories: TrainingTreeCategory[];
  selection: TrainingSelection | null;
  onSelect: (sel: TrainingSelection) => void;
  disabled?: boolean;
};

export function TrainingCategoryTree({ categories, selection, onSelect, disabled }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));

  const expandedSet = useMemo(() => expanded, [expanded]);

  function toggle(catId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function isCatSelected(catId: string) {
    return selection?.categoryId === catId && selection.kind === "category";
  }

  function isQSelected(qId: string) {
    return selection?.kind === "question" && selection.questionId === qId;
  }

  return (
    <div className="outlineStageTree trainingCategoryTree">
      <div className="outlineStageTreeScroll">
        {categories.map((cat) => {
          const open = expandedSet.has(cat.id);
          const hasQ = cat.questions.length > 0;
          return (
            <div key={cat.id} className="outlineStageTreeNode">
              <div
                className={[
                  "outlineStageTreeRow",
                  isCatSelected(cat.id) ? "outlineStageTreeRow--selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ paddingLeft: 8 }}
              >
                <button
                  type="button"
                  className={`outlineStageTreeToggle${hasQ ? "" : " outlineStageTreeToggle--spacer"}`}
                  disabled={!hasQ}
                  onClick={() => toggle(cat.id)}
                  aria-label={open ? "收起" : "展开"}
                >
                  {hasQ ? (open ? "▾" : "▸") : ""}
                </button>
                <button
                  type="button"
                  className="outlineStageTreeLabelBtn trainingTreeLabelBtn"
                  disabled={disabled}
                  onClick={() => onSelect({ kind: "category", categoryId: cat.id })}
                >
                  <span className="trainingTreeTitle">{cat.title}</span>
                  <span className="muted trainingTreeMeta">练 {cat.attemptCount}</span>
                </button>
              </div>
              {open
                ? cat.questions.map((q) => (
                    <div key={q.id} className="outlineStageTreeNode">
                      <div
                        className={[
                          "outlineStageTreeRow",
                          isQSelected(q.id) ? "outlineStageTreeRow--selected" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ paddingLeft: 28 }}
                      >
                        <span className="outlineStageTreeToggle outlineStageTreeToggle--spacer" />
                        <button
                          type="button"
                          className="outlineStageTreeLabelBtn trainingTreeLabelBtn"
                          disabled={disabled}
                          onClick={() =>
                            onSelect({ kind: "question", categoryId: cat.id, questionId: q.id })
                          }
                        >
                          <span className="trainingTreeTitle">{q.title}</span>
                          <span className="muted trainingTreeMeta">
                            练 {q.attemptCount}
                            {q.bestScore != null ? ` · ${q.bestScore}` : ""}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
