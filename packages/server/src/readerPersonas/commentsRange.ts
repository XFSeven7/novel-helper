export const COMMENTS_PER_CHAPTER_ABS_MIN = 1;
export const COMMENTS_PER_CHAPTER_ABS_MAX = 50;
export const COMMENTS_PER_CHAPTER_DEFAULT_MIN = 10;
export const COMMENTS_PER_CHAPTER_DEFAULT_MAX = 16;

export function clampCommentsPerChapterRange(raw?: { min?: number; max?: number }) {
  const min = Math.round(
    Math.min(
      COMMENTS_PER_CHAPTER_ABS_MAX,
      Math.max(COMMENTS_PER_CHAPTER_ABS_MIN, raw?.min ?? COMMENTS_PER_CHAPTER_DEFAULT_MIN)
    )
  );
  const max = Math.round(
    Math.min(
      COMMENTS_PER_CHAPTER_ABS_MAX,
      Math.max(COMMENTS_PER_CHAPTER_ABS_MIN, raw?.max ?? COMMENTS_PER_CHAPTER_DEFAULT_MAX)
    )
  );
  return { min, max: Math.max(min, max) };
}

export function validateCommentsPerChapterRange(raw?: { min?: number; max?: number }) {
  if (raw?.min === undefined && raw?.max === undefined) return true;
  const a = Math.round(raw?.min ?? COMMENTS_PER_CHAPTER_DEFAULT_MIN);
  const b = Math.round(raw?.max ?? COMMENTS_PER_CHAPTER_DEFAULT_MAX);
  return a <= b;
}
