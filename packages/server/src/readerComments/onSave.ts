import {
  readFeatureSettings,
  assertReaderCommentsReady,
  normalizeReaderCommentsOptions,
  type ModelConfig
} from "../featureSettings.js";
import { inviteNewReaders } from "../readerPersonas/invite.js";
import { loadEffectivePersonas, readCustomPersonas } from "../readerPersonas/store.js";
import { generateChapterReaderComments, nicknameMap } from "./generate.js";
import { readChapterComments, writeChapterComments } from "./store.js";
import { normalizeCommentsFile } from "./threadOps.js";
import type { ChapterReaderCommentsFile } from "./types.js";

function mergeCommentFiles(
  previous: ChapterReaderCommentsFile | null,
  batch: ChapterReaderCommentsFile
): ChapterReaderCommentsFile {
  if (!previous?.threads.length) return batch;
  return normalizeCommentsFile({
    ...batch,
    readCount: Math.max(previous.readCount, batch.readCount),
    lurkerSample: [...new Set([...previous.lurkerSample, ...batch.lurkerSample])].slice(0, 30),
    threads: [...previous.threads, ...batch.threads]
  });
}

async function inviteReadersOnSave(input: {
  dataDir: string;
  bookId: string;
  cfg: ModelConfig;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<number> {
  try {
    const { added } = await inviteNewReaders({
      dataDir: input.dataDir,
      count: 20,
      cfg: input.cfg,
      createAiSdkModel: input.createAiSdkModel
    });
    if (added > 0) {
      console.log("[reader-comments] 存稿后已自动邀请新读者", {
        bookId: input.bookId,
        added
      });
    }
    return added;
  } catch (e) {
    console.warn("[reader-comments] 存稿后邀请读者失败:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** 存稿后：自动邀请新读者（若有名额）并追加一批模拟评论（保留已有） */
export async function maybeGenerateReaderCommentsOnSave(input: {
  dataDir: string;
  bookId: string;
  chapterFilename: string;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<{ generated: boolean; comments: ChapterReaderCommentsFile | null }> {
  const settings = await readFeatureSettings();
  if (!settings.features?.readerCommentsEnabled) {
    return { generated: false, comments: null };
  }

  const ready = assertReaderCommentsReady(settings);
  if ("error" in ready) {
    console.warn("[reader-comments] 存稿后跳过生成:", ready.error);
    return { generated: false, comments: null };
  }

  await inviteReadersOnSave({
    dataDir: input.dataDir,
    bookId: input.bookId,
    cfg: ready.cfg,
    createAiSdkModel: input.createAiSdkModel
  });

  const existing = await readChapterComments(input.dataDir, input.bookId, input.chapterFilename);
  const pool = await loadEffectivePersonas(input.dataDir);
  try {
    const batch = await generateChapterReaderComments({
      dataDir: input.dataDir,
      bookId: input.bookId,
      chapterFilename: input.chapterFilename,
      pool,
      options: normalizeReaderCommentsOptions(settings.readerComments),
      cfg: ready.cfg,
      createAiSdkModel: input.createAiSdkModel,
      force: true,
      existing: null,
      seedSuffix: `batch-${existing?.threads.length ?? 0}`
    });
    const comments = mergeCommentFiles(existing, batch);
    await writeChapterComments(input.dataDir, input.bookId, input.chapterFilename, comments);
    console.log("[reader-comments] 存稿后已追加本章评论", {
      bookId: input.bookId,
      chapterFilename: input.chapterFilename,
      added: batch.threads.length,
      total: comments.threads.length
    });
    return { generated: true, comments };
  } catch (e) {
    console.warn("[reader-comments] 存稿后生成失败:", e instanceof Error ? e.message : e);
    return { generated: false, comments: existing };
  }
}

export { nicknameMap };
