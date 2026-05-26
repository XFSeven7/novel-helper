import {
  COMMENTS_PER_CHAPTER_DEFAULT_MAX,
  COMMENTS_PER_CHAPTER_DEFAULT_MIN
} from "./commentsRange.js";
import { getBuiltinPersonas } from "./builtin.js";
import { readCustomPersonas } from "./store.js";

export type ReaderPersonaPoolStats = {
  builtinCount: number;
  customCount: number;
  totalCount: number;
  commentsPerChapterMin: number;
  commentsPerChapterMax: number;
};

export async function getReaderPersonaPoolStats(
  dataDir: string,
  commentsRange?: { min: number; max: number }
): Promise<ReaderPersonaPoolStats> {
  const builtinCount = getBuiltinPersonas().length;
  const custom = await readCustomPersonas(dataDir);
  const customCount = custom.personas.length;
  return {
    builtinCount,
    customCount,
    totalCount: builtinCount + customCount,
    commentsPerChapterMin: commentsRange?.min ?? COMMENTS_PER_CHAPTER_DEFAULT_MIN,
    commentsPerChapterMax: commentsRange?.max ?? COMMENTS_PER_CHAPTER_DEFAULT_MAX
  };
}
