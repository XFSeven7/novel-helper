import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OutlineStageNode } from "../../api";
import {
  buildStagePreviewNumberMap,
  buildStagePreviewSections
} from "../../utils/stagePreview";
import { StagePreviewBody } from "./StagePreviewBody";
import { StagePreviewNavTree } from "./StagePreviewNavTree";

type Props = {
  open: boolean;
  stages: OutlineStageNode[] | undefined;
  onClose: () => void;
};

export function StagePreviewModal({ open, stages, onClose }: Props) {
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedBranchIds, setCollapsedBranchIds] = useState<Set<string>>(() => new Set());

  const sections = useMemo(() => buildStagePreviewSections(stages), [stages]);
  const numberById = useMemo(() => buildStagePreviewNumberMap(sections), [sections]);

  useEffect(() => {
    if (!open) return;
    setActiveId(null);
    setCollapsedBranchIds(new Set());
    const t = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleBranchCollapsed = useCallback((nodeId: string) => {
    setCollapsedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const scrollToNode = useCallback(
    (nodeId: string) => {
      setActiveId(nodeId);
      const section = sections.find((s) => s.nodeId === nodeId);
      if (section) {
        setCollapsedBranchIds((prev) => {
          const next = new Set(prev);
          for (const id of section.ancestorIds) next.delete(id);
          next.delete(nodeId);
          return next;
        });
      }
      requestAnimationFrame(() => {
        const container = bodyScrollRef.current;
        const el = document.getElementById(`stage-preview-${nodeId}`);
        if (!container || !el) return;
        const top = el.offsetTop - container.offsetTop - 8;
        container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    },
    [sections]
  );

  if (!open) return null;

  return (
    <div
      className="modalBackdrop modalBackdropStagePreview"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalPanel modalPanelOpaque modalPanelStagePreview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-preview-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="stagePreviewHeader">
          <h2 id="stage-preview-title" className="modalHeading stagePreviewHeading">
            阶段故事预览
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="btnSort stagePreviewClose"
            onClick={onClose}
            aria-label="关闭预览"
          >
            关闭
          </button>
        </header>
        <div className="stagePreviewMain">
          <aside className="stagePreviewAside">
            <StagePreviewNavTree
              stages={stages}
              numberById={numberById}
              collapsedBranchIds={collapsedBranchIds}
              activeId={activeId}
              onJump={scrollToNode}
            />
          </aside>
          <div className="stagePreviewDivider" aria-hidden />
          <StagePreviewBody
            ref={bodyScrollRef}
            sections={sections}
            collapsedBranchIds={collapsedBranchIds}
            onToggleBranch={toggleBranchCollapsed}
          />
        </div>
      </div>
    </div>
  );
}
