/** 读盘兼容旧 categoryId；树节点 id 为 scene-* 或 cat-* */

export function resolveTopicId(raw: { sceneId?: string; categoryId?: string }): string | null {
  const id = (raw.sceneId ?? raw.categoryId ?? "").trim();
  if (id.startsWith("scene-") || id.startsWith("cat-")) return id;
  return null;
}

/** @deprecated 使用 resolveTopicId */
export const resolveSceneId = resolveTopicId;

export function isLegacyCategoryId(id: string): boolean {
  return id.startsWith("cat-");
}
