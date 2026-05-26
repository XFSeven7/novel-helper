import type { ReaderCommentsOptions } from "../featureSettings.js";
import type { ReaderPersona } from "../readerPersonas/types.js";
import { personaById } from "../readerPersonas/store.js";
import { seededRandom } from "../readerPersonas/schema.js";
import type { ChapterReaderCommentsFile, ReaderCommentReply } from "./types.js";
import crypto from "node:crypto";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function countReplies(file: ChapterReaderCommentsFile): number {
  return file.threads.reduce((n, t) => n + t.replies.length, 0);
}

export function addAuthorReply(
  file: ChapterReaderCommentsFile,
  threadId: string,
  text: string
): { file: ChapterReaderCommentsFile; reply: ReaderCommentReply } {
  const thread = file.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error("评论不存在");
  const reply: ReaderCommentReply = {
    id: newId("r"),
    authorKind: "author",
    personaId: null,
    replyToId: thread.replies.length ? thread.replies[thread.replies.length - 1]!.id : null,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  thread.replies.push(reply);
  return { file, reply };
}

export function maybeNpcFollowUp(
  file: ChapterReaderCommentsFile,
  threadId: string,
  pool: ReaderPersona[],
  options: ReaderCommentsOptions
): ChapterReaderCommentsFile {
  if (countReplies(file) >= 12) return file;
  const thread = file.threads.find((t) => t.id === threadId);
  if (!thread) return file;
  const last = thread.replies[thread.replies.length - 1];
  if (!last || last.authorKind !== "author") return file;

  const rand = seededRandom(`${threadId}:${last.id}:npc`);
  if (rand() > options.npcReplyProbability) return file;

  const persona = personaById(pool, thread.personaId) ?? pool.find((p) => p.id !== thread.personaId);
  if (!persona) return file;

  const lines = ["哼，追更再说", "作者加油", "下章别拖节奏啊", "收到，坐等更新😏", "行吧行吧"];
  thread.replies.push({
    id: newId("r"),
    authorKind: "persona",
    personaId: persona.id,
    replyToId: last.id,
    text: lines[Math.floor(rand() * lines.length)]!,
    createdAt: new Date().toISOString()
  });
  return file;
}

export function maybeReaderToReaderReply(
  file: ChapterReaderCommentsFile,
  threadId: string,
  pool: ReaderPersona[],
  options: ReaderCommentsOptions
): ChapterReaderCommentsFile {
  if (countReplies(file) >= 12) return file;
  const thread = file.threads.find((t) => t.id === threadId);
  if (!thread || thread.replies.length === 0) return file;

  const rand = seededRandom(`${threadId}:r2r`);
  if (rand() > options.readerReplyReaderProbability) return file;

  const other = pool.find((p) => p.id !== thread.personaId && p.tier === "normal");
  if (!other) return file;

  const target = thread.replies[thread.replies.length - 1]!;
  thread.replies.push({
    id: newId("r"),
    authorKind: "persona",
    personaId: other.id,
    replyToId: target.id,
    text: ["附议", "楼上说得对", "同感+1", "哈哈哈确实"][Math.floor(rand() * 4)]!,
    createdAt: new Date().toISOString()
  });
  return file;
}
