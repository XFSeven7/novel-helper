import fs from "node:fs/promises";
import path from "node:path";
import { truncateForPrompt } from "../prompts/index.js";
import type { OutlineIndex } from "../outlineStore.js";
import { findStageNode, stageRoots } from "./stageTree.js";

function truncate(s: string, max: number): string {
  return truncateForPrompt(String(s || "").trim(), max);
}

async function readBookMeta(dataDir: string, bookId: string): Promise<{ title: string; synopsis: string }> {
  try {
    const raw = await fs.readFile(path.join(dataDir, bookId, "meta.json"), "utf8");
    const parsed = JSON.parse(raw) as { title?: string; synopsis?: string };
    return {
      title: String(parsed?.title || "").trim(),
      synopsis: String(parsed?.synopsis || "").trim()
    };
  } catch {
    return { title: "", synopsis: "" };
  }
}

export async function buildStageChatContextBlock(
  dataDir: string,
  bookId: string,
  outline: OutlineIndex,
  stageId: string
): Promise<string> {
  const roots = stageRoots(outline.book.mainlineStages);
  const found = findStageNode(roots, stageId);
  if (!found) throw new Error("Not found");

  const meta = await readBookMeta(dataDir, bookId);
  const book = outline.book;
  const syn = book.synopsis ?? {};
  const pathLabels = found.path.map((n) => n.label?.trim() || "未命名阶段").join(" · ");

  const lines: string[] = [
    "## 书籍",
    meta.title ? `书名：${truncate(meta.title, 200)}` : "",
    meta.synopsis ? `简介：${truncate(meta.synopsis, 2000)}` : "",
    book.logline ? `一句话：${truncate(book.logline, 1500)}` : "",
    "## 五段梗概",
    syn.setup ? `起因：${truncate(syn.setup, 1500)}` : "",
    syn.development ? `发展：${truncate(syn.development, 1500)}` : "",
    syn.twist ? `转折：${truncate(syn.twist, 1500)}` : "",
    syn.climax ? `高潮：${truncate(syn.climax, 1500)}` : "",
    syn.ending ? `结局：${truncate(syn.ending, 1500)}` : "",
    "## 当前阶段",
    `路径：${pathLabels}`,
    `标题：${truncate(found.node.label, 200)}`,
    found.node.note ? `备注：${truncate(found.node.note, 3000)}` : "备注：（空）"
  ];

  const ancestors = found.path.slice(0, -1);
  if (ancestors.length) {
    lines.push("## 祖先阶段");
    for (const a of ancestors) {
      lines.push(
        `- ${truncate(a.label, 120)}${a.note ? `：${truncate(a.note, 800)}` : ""}`
      );
    }
  }

  const siblingLabels = found.siblings
    .filter((s) => s.id !== found.node.id)
    .map((s) => s.label?.trim() || "未命名阶段");
  if (siblingLabels.length) {
    lines.push("## 同级阶段", siblingLabels.map((l) => `- ${truncate(l, 120)}`).join("\n"));
  }

  const volumes = outline.volumes ?? [];
  if (volumes.length) {
    lines.push("## 分卷（摘要）");
    for (const v of volumes.slice(0, 30)) {
      lines.push(
        `- ${truncate(v.title, 120)}${v.synopsis ? `：${truncate(v.synopsis, 400)}` : ""}`
      );
    }
  }

  return lines.filter(Boolean).join("\n");
}
