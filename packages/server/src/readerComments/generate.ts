import crypto from "node:crypto";
import { readChapter, readAuditAnalysisText } from "../fsStore.js";
import type { ModelConfig } from "../featureSettings.js";
import type { ReaderCommentsOptions } from "../featureSettings.js";
import type { ReaderPersona } from "../readerPersonas/types.js";
import {
  pickChapterReadersByProbability,
  randomCommentsCapForChapter
} from "../readerPersonas/schema.js";
import { generateThreadsWithAi, loadChapterContextForAi } from "./aiGenerate.js";
import type { ChapterReaderCommentsFile, ReaderCommentThread } from "./types.js";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function generateChapterReaderComments(input: {
  dataDir: string;
  bookId: string;
  chapterFilename: string;
  pool: ReaderPersona[];
  options: ReaderCommentsOptions;
  cfg: ModelConfig;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  force?: boolean;
  existing?: ChapterReaderCommentsFile | null;
  /** 追加生成时传入，避免与上一批抽人种子相同 */
  seedSuffix?: string;
}): Promise<ChapterReaderCommentsFile> {
  const { dataDir, bookId, chapterFilename, pool, options, cfg, createAiSdkModel, force, existing, seedSuffix } =
    input;

  const { contentHash, chapterContext } = await loadChapterContextForAi(
    dataDir,
    bookId,
    chapterFilename,
    options.useChapterAnalysisInput,
    readChapter,
    readAuditAnalysisText
  );

  if (!force && existing && existing.contentHash === contentHash) {
    return existing;
  }

  const chapterSeed = `${bookId}:${chapterFilename}:${contentHash}${seedSuffix ? `:${seedSuffix}` : ""}`;
  const commentsCap = randomCommentsCapForChapter(
    chapterSeed,
    options.commentsPerChapterMin,
    options.commentsPerChapterMax
  );
  const pick = pickChapterReadersByProbability(pool, chapterSeed, commentsCap);
  const now = new Date().toISOString();

  console.log("[reader-comments] 本地概率抽人", {
    bookId,
    chapterFilename,
    commentsCap,
    readCount: pick.readers.length,
    speakerCount: pick.speakers.length,
    lurkerCount: pick.lurkers.length,
    speakers: pick.speakers.map((s) => ({
      id: s.persona.id,
      nickname: s.persona.nickname,
      tier: s.persona.tier,
      intendedKind: s.intendedKind
    }))
  });

  if (!pick.speakers.length) {
    throw new Error("本章概率抽样后没有读者发言，请重新存稿生成");
  }

  let threads: ReaderCommentThread[];
  try {
    threads = await generateThreadsWithAi({
      chapterContext,
      speakerSlots: pick.speakers,
      maxThreads: commentsCap,
      cfg,
      createAiSdkModel,
      newId,
      now
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`模拟评论 AI 生成失败：${msg}`);
  }

  const lurkerSample = pick.lurkers.slice(0, 30).map((p) => p.id);

  return {
    version: 1,
    contentHash,
    generatedAt: now,
    readCount: pick.readers.length,
    threads,
    lurkerSample
  };
}

export function nicknameMap(pool: ReaderPersona[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of pool) m[p.id] = p.nickname;
  return m;
}
