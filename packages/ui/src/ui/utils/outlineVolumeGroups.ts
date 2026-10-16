import type { OutlineIndex, VolumeOutline } from "../api";

/** prefs / UI key for the synthetic「未分卷」group */
export const UNGROUPED_VOLUME_KEY = "__ungrouped__";

export type VolumeChapterGroup<T extends { filename: string }> = {
  key: string;
  title: string;
  chapters: T[];
};

function sortVolumes(volumes: VolumeOutline[]): VolumeOutline[] {
  return [...volumes].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh"));
}

/**
 * Group chapters by outline volumes. Returns null when there are no volumes
 * (caller should render a flat list). Chapter order follows `chapters` order.
 */
export function groupChaptersByVolumes<T extends { filename: string }>(
  chapters: T[],
  outline: Pick<OutlineIndex, "volumes" | "ungroupedFilenames"> | null | undefined
): VolumeChapterGroup<T>[] | null {
  const volumes = outline?.volumes ?? [];
  if (!volumes.length) return null;

  const byFn = new Map(chapters.map((c) => [c.filename, c]));
  const orderIndex = new Map(chapters.map((c, i) => [c.filename, i]));
  const placed = new Set<string>();
  const groups: VolumeChapterGroup<T>[] = [];

  for (const vol of sortVolumes(volumes)) {
    const list = vol.chapterFilenames
      .map((f) => byFn.get(f))
      .filter((c): c is T => Boolean(c))
      .sort((a, b) => (orderIndex.get(a.filename) ?? 0) - (orderIndex.get(b.filename) ?? 0));
    list.forEach((c) => placed.add(c.filename));
    groups.push({ key: vol.id, title: vol.title, chapters: list });
  }

  const ungroupedOrder = outline?.ungroupedFilenames ?? [];
  const ungroupedFromOutline = ungroupedOrder
    .map((f) => byFn.get(f))
    .filter((c): c is T => Boolean(c) && !placed.has(c.filename));
  ungroupedFromOutline.forEach((c) => placed.add(c.filename));
  const orphans = chapters.filter((c) => !placed.has(c.filename));
  const ungrouped = [...ungroupedFromOutline, ...orphans].sort(
    (a, b) => (orderIndex.get(a.filename) ?? 0) - (orderIndex.get(b.filename) ?? 0)
  );

  if (ungrouped.length) {
    groups.push({ key: UNGROUPED_VOLUME_KEY, title: "未分卷", chapters: ungrouped });
  }

  return groups;
}
