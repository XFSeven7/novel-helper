import React, { useMemo, useState } from "react";
import type { CopybookListItem, TrainingTree, TrainingTreeGroup } from "../../api";
import { TRAINING_COPYBOOK_GROUP_ID, TRAINING_COPYBOOK_SCENE_ID } from "./trainingCopybook";

export type TrainingSelection =
  | { kind: "group"; groupId: string }
  | { kind: "scene"; groupId: string; sceneId: string }
  | { kind: "question"; groupId: string; sceneId: string; questionId: string }
  | { kind: "copybook"; groupId: string; sceneId: string; bookId: string; chapterIndex: number };

type Props = {
  groups: TrainingTree["groups"];
  copybooks: CopybookListItem[];
  selection: TrainingSelection | null;
  onSelect: (sel: TrainingSelection) => void;
  onDeleteCopybook?: (bookId: string) => void;
  disabled?: boolean;
};

function copybookStatusMark(status: CopybookListItem["chapters"][number]["status"]) {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "●";
  return "";
}

function CopybookBookList(props: {
  copybooks: CopybookListItem[];
  groupId: string;
  paddingLeft: number;
  chapterPaddingLeft: number;
  expandedCopybooks: Set<string>;
  selection: TrainingSelection | null;
  onToggleCopybook: (bookId: string) => void;
  onSelect: (sel: TrainingSelection) => void;
  onDeleteCopybook?: (bookId: string) => void;
  disabled?: boolean;
}) {
  function isCopybookChapterSelected(bookId: string, chapterIndex: number) {
    return (
      props.selection?.kind === "copybook" &&
      props.selection.bookId === bookId &&
      props.selection.chapterIndex === chapterIndex
    );
  }

  if (props.copybooks.length === 0) {
    return (
      <p className="muted trainingCopybookTreeEmpty" style={{ paddingLeft: props.paddingLeft }}>
        暂无书目，请在学法区导入 txt
      </p>
    );
  }

  return (
    <>
      {props.copybooks.map((book) => {
        const bookOpen = props.expandedCopybooks.has(book.id);
        return (
          <div key={book.id} className="outlineStageTreeNode">
            <div
              className="outlineStageTreeRow trainingCopybookBookRow"
              style={{ paddingLeft: props.paddingLeft }}
            >
              <button
                type="button"
                className="outlineStageTreeRowBtn trainingTreeRowBtn trainingCopybookBookRowMain"
                disabled={props.disabled}
                aria-expanded={bookOpen}
                onClick={() => props.onToggleCopybook(book.id)}
              >
                <span className="outlineStageTreeToggle outlineStageTreeToggle--decor" aria-hidden>
                  {bookOpen ? "▾" : "▸"}
                </span>
                <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
                  <span className="trainingTreeTitle">{book.title}</span>
                  <span className="muted trainingTreeMeta">{book.chapterCount} 章</span>
                </span>
              </button>
              {props.onDeleteCopybook && !props.disabled ? (
                <span className="outlineStageTreeActions">
                  <button
                    type="button"
                    className="outlineStageTreeAct outlineStageTreeAct--danger"
                    title="删除书目"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteCopybook?.(book.id);
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M10 12V17"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 12V17"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 7H20"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 7V19C6 20 7 21 8 21H16C17 21 18 20 18 19V7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9 7V5C9 4 10 3 11 3H13C14 3 15 4 15 5V7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </span>
              ) : null}
            </div>
            {bookOpen
              ? book.chapters.map((ch) => {
                  const mark = copybookStatusMark(ch.status);
                  return (
                    <div key={ch.index} className="outlineStageTreeNode">
                      <button
                        type="button"
                        className={[
                          "outlineStageTreeRow",
                          "outlineStageTreeRowBtn",
                          "trainingTreeRowBtn",
                          isCopybookChapterSelected(book.id, ch.index)
                            ? "outlineStageTreeRow--selected"
                            : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ paddingLeft: props.chapterPaddingLeft }}
                        disabled={props.disabled}
                        onClick={() =>
                          props.onSelect({
                            kind: "copybook",
                            groupId: props.groupId,
                            sceneId: TRAINING_COPYBOOK_SCENE_ID,
                            bookId: book.id,
                            chapterIndex: ch.index
                          })
                        }
                      >
                        <span className="outlineStageTreeToggle outlineStageTreeToggle--spacer" aria-hidden />
                        <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
                          <span className="trainingTreeTitle">{ch.title}</span>
                          {mark ? <span className="muted trainingTreeMeta">{mark}</span> : null}
                        </span>
                      </button>
                    </div>
                  );
                })
              : null}
          </div>
        );
      })}
    </>
  );
}

function GroupSection(props: {
  group: TrainingTreeGroup;
  copybooks: CopybookListItem[];
  selection: TrainingSelection | null;
  expandedScenes: Set<string>;
  expandedCopybooks: Set<string>;
  onToggleScene: (sceneId: string) => void;
  onToggleCopybook: (bookId: string) => void;
  onSelect: (sel: TrainingSelection) => void;
  onDeleteCopybook?: (bookId: string) => void;
  disabled?: boolean;
}) {
  const isCopybookGroup = props.group.id === TRAINING_COPYBOOK_GROUP_ID;

  function groupContainsSelection() {
    const sel = props.selection;
    if (!sel || sel.kind === "group") return sel?.groupId === props.group.id;
    return sel.groupId === props.group.id;
  }

  const [expanded, setExpanded] = useState(groupContainsSelection);

  function isSceneSelected(sceneId: string) {
    if (props.selection?.kind === "scene") {
      return props.selection.groupId === props.group.id && props.selection.sceneId === sceneId;
    }
    if (props.selection?.kind === "copybook") {
      return props.selection.groupId === props.group.id && props.selection.sceneId === sceneId;
    }
    return false;
  }

  function isQSelected(qId: string) {
    return props.selection?.kind === "question" && props.selection.questionId === qId;
  }

  const groupSelected =
    props.selection?.kind === "group" && props.selection.groupId === props.group.id;

  const copybookGroupActive =
    isCopybookGroup &&
    ((props.selection?.kind === "scene" &&
      props.selection.groupId === props.group.id &&
      props.selection.sceneId === TRAINING_COPYBOOK_SCENE_ID) ||
      props.selection?.kind === "copybook");

  return (
    <div className="outlineStageTreeNode">
      <button
        type="button"
        className={[
          "outlineStageTreeRow",
          "outlineStageTreeRowBtn",
          "trainingTreeRowBtn",
          "trainingTreeGroupRow",
          groupSelected || copybookGroupActive ? "outlineStageTreeRow--selected" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 6 }}
        disabled={props.disabled}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((v) => !v);
          if (isCopybookGroup) {
            props.onSelect({
              kind: "scene",
              groupId: props.group.id,
              sceneId: TRAINING_COPYBOOK_SCENE_ID
            });
          } else {
            props.onSelect({ kind: "group", groupId: props.group.id });
          }
        }}
      >
        <span className="outlineStageTreeToggle outlineStageTreeToggle--decor" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="outlineStageTreeLabelBtn trainingTreeLabelBtn">
          <span className="trainingTreeTitle">{props.group.title}</span>
          {isCopybookGroup && props.copybooks.length > 0 ? (
            <span className="muted trainingTreeMeta">{props.copybooks.length} 本</span>
          ) : null}
        </span>
      </button>
      {expanded && isCopybookGroup ? (
        <CopybookBookList
          copybooks={props.copybooks}
          groupId={props.group.id}
          paddingLeft={12}
          chapterPaddingLeft={24}
          expandedCopybooks={props.expandedCopybooks}
          selection={props.selection}
          onToggleCopybook={props.onToggleCopybook}
          onSelect={props.onSelect}
          onDeleteCopybook={props.onDeleteCopybook}
          disabled={props.disabled}
        />
      ) : null}
      {expanded && !isCopybookGroup
        ? props.group.scenes.map((scene) => {
            const open = props.expandedScenes.has(scene.id);
            const hasQuestions = scene.questions.length > 0;
            const expandable = hasQuestions;

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
                  style={{ paddingLeft: 12 }}
                  disabled={props.disabled}
                  aria-expanded={expandable ? open : undefined}
                  onClick={() => {
                    if (expandable) props.onToggleScene(scene.id);
                    props.onSelect({ kind: "scene", groupId: props.group.id, sceneId: scene.id });
                  }}
                >
                  <span
                    className={`outlineStageTreeToggle outlineStageTreeToggle--decor${
                      expandable ? "" : " outlineStageTreeToggle--spacer"
                    }`}
                    aria-hidden
                  >
                    {expandable ? (open ? "▾" : "▸") : ""}
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
                          style={{ paddingLeft: 24 }}
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

export function TrainingSceneTree({
  groups,
  copybooks,
  selection,
  onSelect,
  onDeleteCopybook,
  disabled
}: Props) {
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selection?.kind === "scene") initial.add(selection.sceneId);
    if (selection?.kind === "question") initial.add(selection.sceneId);
    return initial;
  });

  const [expandedCopybooks, setExpandedCopybooks] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selection?.kind === "copybook") initial.add(selection.bookId);
    return initial;
  });

  const expandedSet = useMemo(() => expandedScenes, [expandedScenes]);
  const expandedBooksSet = useMemo(() => expandedCopybooks, [expandedCopybooks]);

  function toggleScene(sceneId: string) {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  function toggleCopybook(bookId: string) {
    setExpandedCopybooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
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
            copybooks={copybooks}
            selection={selection}
            expandedScenes={expandedSet}
            expandedCopybooks={expandedBooksSet}
            onToggleScene={toggleScene}
            onToggleCopybook={toggleCopybook}
            onSelect={onSelect}
            onDeleteCopybook={onDeleteCopybook}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
