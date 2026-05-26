import React, { forwardRef } from "react";
import {
  isStagePreviewSectionHidden,
  type StagePreviewSection
} from "../../utils/stagePreview";

type Props = {
  sections: StagePreviewSection[];
  collapsedBranchIds: ReadonlySet<string>;
  onToggleBranch: (nodeId: string) => void;
};

export const StagePreviewBody = forwardRef<HTMLDivElement, Props>(function StagePreviewBody(
  { sections, collapsedBranchIds, onToggleBranch },
  ref
) {
  if (!sections.length) {
    return (
      <div ref={ref} className="stagePreviewBody">
        <p className="muted stagePreviewBodyEmpty">暂无阶段，请先在左侧添加根阶段</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="stagePreviewBody">
      {sections.map((sec) => {
        if (isStagePreviewSectionHidden(sec, collapsedBranchIds)) return null;

        const branchCollapsed = collapsedBranchIds.has(sec.nodeId);

        return (
          <section
            key={sec.nodeId}
            id={`stage-preview-${sec.nodeId}`}
            className="stagePreviewSection"
            style={{ paddingLeft: `${12 + sec.depth * 16}px` }}
          >
            <h3 className="stagePreviewSectionTitle">
              <button
                type="button"
                className="stagePreviewSectionTitleBtn"
                aria-expanded={!branchCollapsed}
                aria-controls={`stage-preview-note-${sec.nodeId}`}
                onClick={() => onToggleBranch(sec.nodeId)}
              >
                <span className="stagePreviewSectionChevron" aria-hidden>
                  {branchCollapsed ? "▸" : "▾"}
                </span>
                <span className="stagePreviewSectionNumber">{sec.number}</span> {sec.label}
              </button>
            </h3>
            {!branchCollapsed ? (
              sec.note ? (
                <div
                  id={`stage-preview-note-${sec.nodeId}`}
                  className="stagePreviewSectionNote"
                >
                  {sec.note}
                </div>
              ) : (
                <p
                  id={`stage-preview-note-${sec.nodeId}`}
                  className="muted stagePreviewSectionNoteEmpty"
                >
                  （暂无细纲）
                </p>
              )
            ) : null}
          </section>
        );
      })}
    </div>
  );
});
