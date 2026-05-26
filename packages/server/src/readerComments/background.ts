import type { ModelConfig } from "../featureSettings.js";
import { maybeGenerateReaderCommentsOnSave } from "./onSave.js";

const inFlight = new Set<string>();

export function readerCommentsJobKey(bookId: string, chapterFilename: string): string {
  return `${bookId}\0${chapterFilename}`;
}

export function isReaderCommentsGenerationInFlight(bookId: string, chapterFilename: string): boolean {
  return inFlight.has(readerCommentsJobKey(bookId, chapterFilename));
}

/** 存稿后后台生成，不阻塞 HTTP 响应 */
export function queueReaderCommentsOnSave(input: {
  dataDir: string;
  bookId: string;
  chapterFilename: string;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
}): void {
  const key = readerCommentsJobKey(input.bookId, input.chapterFilename);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  void maybeGenerateReaderCommentsOnSave(input)
    .catch((e) => {
      console.warn("[reader-comments] 后台生成异常:", e instanceof Error ? e.message : e);
    })
    .finally(() => {
      inFlight.delete(key);
    });
}
