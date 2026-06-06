import crypto from "node:crypto";
import type { OutlineIndex, OutlineStageNode } from "../outlineStore.js";
import { findStageNode, stageRoots, updateStageNodeInTree } from "./stageTree.js";

export const MAX_PATCH_DEPTH = 3;
export const MAX_PATCH_NODES = 12;

export type StagePatchNode = {
  id?: string;
  label: string;
  note?: string;
  children?: StagePatchNode[];
};

export type StagePatch = {
  currentNote?: string;
  children?: StagePatchNode[];
};

export type ApplyStagePatchResult = {
  outline: OutlineIndex;
  createdIds: string[];
  warnings: string[];
};

const PATCH_FENCE_RE = /```stagePatch\s*([\s\S]*?)```/i;

export function stripStagePatchBlock(text: string): string {
  return text.replace(PATCH_FENCE_RE, "").trim();
}

export function parseStagePatchFromAssistant(text: string): {
  patch: StagePatch | null;
  displayText: string;
} {
  const m = text.match(PATCH_FENCE_RE);
  const displayText = stripStagePatchBlock(text);
  if (!m?.[1]) return { patch: null, displayText };
  try {
    const raw = JSON.parse(m[1].trim()) as StagePatch;
    if (!raw || typeof raw !== "object") return { patch: null, displayText };
    return { patch: normalizePatch(raw), displayText };
  } catch {
    return { patch: null, displayText };
  }
}

function normalizePatch(raw: StagePatch): StagePatch | null {
  const children = normalizePatchNodes(raw.children);
  const currentNote =
    typeof raw.currentNote === "string" ? raw.currentNote.trim() : undefined;
  if (!currentNote && !children?.length && raw.children === undefined) return null;
  const out: StagePatch = {};
  if (currentNote) out.currentNote = currentNote;
  if (raw.children !== undefined) out.children = children ?? [];
  return out;
}

function normalizePatchNodes(nodes: StagePatchNode[] | undefined): StagePatchNode[] | undefined {
  if (!Array.isArray(nodes)) return undefined;
  const out: StagePatchNode[] = [];
  for (const n of nodes) {
    const label = String(n?.label ?? "").trim();
    if (!label) continue;
    const note = typeof n?.note === "string" ? n.note.trim() : undefined;
    const id = typeof n?.id === "string" && n.id.trim() ? n.id.trim() : undefined;
    const children = normalizePatchNodes(n.children);
    out.push({
      label,
      ...(note ? { note } : {}),
      ...(id ? { id } : {}),
      ...(children?.length ? { children } : {})
    });
  }
  return out;
}

function newStageId(): string {
  return `stage-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function applyStagePatch(
  outline: OutlineIndex,
  stageId: string,
  patch: StagePatch
): ApplyStagePatchResult {
  const roots = stageRoots(outline.book.mainlineStages);
  const found = findStageNode(roots, stageId);
  if (!found) throw new Error("Not found");

  const createdIds: string[] = [];
  const warnings: string[] = [];

  let nextRoots = roots;
  const nodePatch: Partial<Pick<OutlineStageNode, "note" | "children">> = {};

  if (patch.currentNote?.trim()) {
    nodePatch.note = patch.currentNote.trim();
  }

  if (patch.children !== undefined) {
    const { nodes: mergedChildren, warns } = mergeChildPatchList(
      found.node.children ?? [],
      patch.children,
      1,
      createdIds
    );
    warnings.push(...warns);
    nodePatch.children = mergedChildren;
  }

  if (Object.keys(nodePatch).length) {
    nextRoots = updateStageNodeInTree(nextRoots, stageId, nodePatch);
  }

  return {
    outline: {
      ...outline,
      book: {
        ...outline.book,
        mainlineStages: nextRoots.length ? nextRoots : undefined
      }
    },
    createdIds,
    warnings
  };
}

function mergeChildPatchList(
  existing: OutlineStageNode[],
  patchNodes: StagePatchNode[],
  depth: number,
  createdAcc: string[]
): { nodes: OutlineStageNode[]; warns: string[] } {
  const warns: string[] = [];
  if (depth > MAX_PATCH_DEPTH) {
    warns.push(`子树深度超过 ${MAX_PATCH_DEPTH}，已截断`);
    return { nodes: [], warns };
  }

  const limited = patchNodes.slice(0, MAX_PATCH_NODES);
  if (patchNodes.length > MAX_PATCH_NODES) {
    warns.push(`单次 patch 节点数超过 ${MAX_PATCH_NODES}，已截断`);
  }

  const byId = new Map(existing.map((n) => [n.id, n]));
  const nodes: OutlineStageNode[] = [];

  for (const pn of limited) {
    const existingNode = pn.id ? byId.get(pn.id) : undefined;
    const id = existingNode ? existingNode.id : newStageId();
    if (!existingNode) {
      createdAcc.push(id);
    }

    const childExisting = existingNode?.children ?? [];
    let childNodes: OutlineStageNode[] | undefined;

    if (pn.children !== undefined) {
      const merged = mergeChildPatchList(childExisting, pn.children, depth + 1, createdAcc);
      warns.push(...merged.warns);
      childNodes = merged.nodes.length ? merged.nodes : undefined;
    } else if (existingNode?.children?.length) {
      childNodes = existingNode.children;
    }

    nodes.push({
      id,
      label: pn.label,
      ...(pn.note !== undefined ? { note: pn.note } : existingNode?.note ? { note: existingNode.note } : {}),
      ...(childNodes?.length ? { children: childNodes } : {})
    });
  }

  return { nodes, warns };
}
