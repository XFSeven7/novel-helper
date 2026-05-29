import React, { useMemo, useState } from "react";
import type { TrainingTree, TrainingTreeGroup } from "../../api";

export type TrainingSelection =
  | { kind: "group"; groupId: string }
  | { kind: "scene"; groupId: string; sceneId: string }
  | { kind: "question"; groupId: string; sceneId: string; questionId: string };

type Props = {
  groups: TrainingTree["groups"];
  selection: TrainingSelection | null;
  onSelect: (sel: TrainingSelection) => void;
  disabled?: boolean;
};

function GroupSection(props: {
  group: TrainingTreeGroup;
  selection: TrainingSelection | null;
  expandedScenes: Set<string>;
  onToggleScene: (sceneId: string) => void;
  onSelect: (sel: TrainingSelection) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  function isSceneSelected(sceneId: string) {
    return (
      props.selection?.kind === "scene" &&
      props.selection.groupId === props.group.id &&
      props.selection.sceneId === sceneId
    );
  }

  function isQSelected(qId: string) {
    return props.selection?.kind === "question" && props.selection.questionId === qId;
  }

  const groupSelected =
    props.selection?.kind === "group" && props.selection.groupId === props.group.id;

  return (
    <div className="outlineStageTreeNode">
      <button
        type="button"
        className={[
          "outlineStageTreeRow",
          "outlineStageTreeRowBtn",
          "trainingTreeRowBtn",
          "trainingTreeGroupRow",
          groupSelected ? "outlineStageTreeRow--selected" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 8 }}
        disabled={props.disabled}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((v) => !v);
          props.onSelect({ kind: "group", groupId: props.group.id });
        }}
      >
        <span className="outlineStageTreeToggle outlineStageTreeToggle--decor" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
          <span className="trainingTreeTitle">{props.group.title}</span>
        </span>
      </button>
      {expanded
        ? props.group.scenes.map((scene) => {
            const open = props.expandedScenes.has(scene.id);
            const hasQ = scene.questions.length > 0;
            return (
              <div key={scene.id} className="outlineStageTreeNode">
                <button
                  type="button"
                  className={[
                    "outlineStageTreeRow",
                    "outlineStageTreeRowBtn",
                    "trainingTreeRowBtn",
                    isSceneSelected(scene.id) ? "outlineStageTreeRow--selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ paddingLeft: 20 }}
                  disabled={props.disabled}
                  aria-expanded={hasQ ? open : undefined}
                  onClick={() => {
                    if (hasQ) props.onToggleScene(scene.id);
                    props.onSelect({ kind: "scene", groupId: props.group.id, sceneId: scene.id });
                  }}
                >
                  <span
                    className={`outlineStageTreeToggle outlineStageTreeToggle--decor${
                      hasQ ? "" : " outlineStageTreeToggle--spacer"
                    }`}
                    aria-hidden
                  >
                    {hasQ ? (open ? "▾" : "▸") : ""}
                  </span>
                  <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
                    <span className="trainingTreeTitle">{scene.title}</span>
                    <span className="muted trainingTreeMeta">练 {scene.attemptCount}</span>
                  </span>
                </button>
                {open
                  ? scene.questions.map((q) => (
                      <div key={q.id} className="outlineStageTreeNode">
                        <button
                          type="button"
                          className={[
                            "outlineStageTreeRow",
                            "outlineStageTreeRowBtn",
                            "trainingTreeRowBtn",
                            isQSelected(q.id) ? "outlineStageTreeRow--selected" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{ paddingLeft: 40 }}
                          disabled={props.disabled}
                          onClick={() =>
                            props.onSelect({
                              kind: "question",
                              groupId: props.group.id,
                              sceneId: scene.id,
                              questionId: q.id
                            })
                          }
                        >
                          <span
                            className="outlineStageTreeToggle outlineStageTreeToggle--spacer"
                            aria-hidden
                          />
                          <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
                            <span className="trainingTreeTitle">{q.title}</span>
                            <span className="muted trainingTreeMeta">
                              练 {q.attemptCount}
                              {q.bestScore != null ? ` · ${q.bestScore}` : ""}
                            </span>
                          </span>
                        </button>
                      </div>
                    ))
                  : null}
              </div>
            );
          })
        : null}
    </div>
  );
}

export function TrainingSceneTree({ groups, selection, onSelect, disabled }: Props) {
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selection?.kind === "scene") initial.add(selection.sceneId);
    if (selection?.kind === "question") initial.add(selection.sceneId);
    return initial;
  });

  const expandedSet = useMemo(() => expandedScenes, [expandedScenes]);

  function toggleScene(sceneId: string) {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  return (
    <div className="outlineStageTree trainingCategoryTree">
      <div className="outlineStageTreeScroll">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            selection={selection}
            expandedScenes={expandedSet}
            onToggleScene={toggleScene}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
