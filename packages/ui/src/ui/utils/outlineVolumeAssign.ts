import type { OutlineIndex, VolumeOutline } from "../api";

function sortVolumes(volumes: VolumeOutline[]): VolumeOutline[] {
  return [...volumes].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh"));
}

function orderIndexMap(chapterOrder: string[]): Map<string, number> {
  return new Map(chapterOrder.map((f, i) => [f, i]));
}

function ownerMap(volumes: VolumeOutline[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const v of volumes) for (const f of v.chapterFilenames) owner.set(f, v.id);
  return owner;
}

function rebuildFromOwner(
  prev: OutlineIndex,
  chapterOrder: string[],
  owner: Map<string, string>
): OutlineIndex {
  const volumes = prev.volumes.map((v) => ({
    ...v,
    chapterFilenames: chapterOrder.filter((f) => owner.get(f) === v.id)
  }));
  const ungroupedFilenames = chapterOrder.filter((f) => !owner.has(f));
  return { ...prev, volumes, ungroupedFilenames };
}

/** Max chapter index owned by volumes with order strictly less than `volumeId`'s order; -1 if none. */
export function prevVolumeEndIndex(
  volumes: VolumeOutline[],
  volumeId: string,
  chapterOrder: string[]
): number {
  const idx = orderIndexMap(chapterOrder);
  const target = volumes.find((v) => v.id === volumeId);
  if (!target) return -1;
  let max = -1;
  for (const v of volumes) {
    if (v.order >= target.order) continue;
    for (const f of v.chapterFilenames) {
      const i = idx.get(f);
      if (i !== undefined && i > max) max = i;
    }
  }
  return max;
}

export function volumeEndIndex(
  volumes: VolumeOutline[],
  volumeId: string,
  chapterOrder: string[]
): number {
  const idx = orderIndexMap(chapterOrder);
  const vol = volumes.find((v) => v.id === volumeId);
  if (!vol?.chapterFilenames.length) return prevVolumeEndIndex(volumes, volumeId, chapterOrder);
  let max = -1;
  for (const f of vol.chapterFilenames) {
    const i = idx.get(f);
    if (i !== undefined && i > max) max = i;
  }
  return max;
}

/**
 * Chapters that can join `volumeId` while keeping sequential contiguous blocks:
 * only the contiguous forward span after the volume's current end (through later
 * ungrouped / later-volume chapters). Earlier volumes' chapters are not offered.
 */
export function assignableFilenamesForVolume(
  outline: Pick<OutlineIndex, "volumes">,
  volumeId: string,
  chapterOrder: string[]
): string[] {
  const end = volumeEndIndex(outline.volumes, volumeId, chapterOrder);
  const owner = ownerMap(outline.volumes);
  const target = outline.volumes.find((v) => v.id === volumeId);
  if (!target) return [];
  const out: string[] = [];
  for (let i = end + 1; i < chapterOrder.length; i++) {
    const f = chapterOrder[i]!;
    const oid = owner.get(f);
    if (!oid) {
      out.push(f);
      continue;
    }
    const ov = outline.volumes.find((v) => v.id === oid);
    // can pull from same or later volumes only
    if (oid === volumeId || (ov && ov.order >= target.order)) {
      out.push(f);
      continue;
    }
    break;
  }
  return out;
}

/** Assign chapter `filename` into volume: takes contiguous [volumeEnd+1 .. idx(filename)]. */
export function assignContiguousToVolume(
  prev: OutlineIndex,
  volumeId: string,
  filename: string,
  chapterOrder: string[]
): OutlineIndex {
  const idx = orderIndexMap(chapterOrder);
  const at = idx.get(filename);
  if (at === undefined) return prev;
  const assignable = new Set(assignableFilenamesForVolume(prev, volumeId, chapterOrder));
  if (!assignable.has(filename)) return prev;

  const end = volumeEndIndex(prev.volumes, volumeId, chapterOrder);
  const owner = ownerMap(prev.volumes);
  for (let i = end + 1; i <= at; i++) owner.set(chapterOrder[i]!, volumeId);
  return rebuildFromOwner(prev, chapterOrder, owner);
}

/** Assign all currently assignable chapters (forward contiguous) into the volume. */
export function assignAllContiguousToVolume(
  prev: OutlineIndex,
  volumeId: string,
  chapterOrder: string[]
): OutlineIndex {
  const list = assignableFilenamesForVolume(prev, volumeId, chapterOrder);
  if (!list.length) return prev;
  return assignContiguousToVolume(prev, volumeId, list[list.length - 1]!, chapterOrder);
}

/**
 * Remove chapter and the volume's suffix after it → ungrouped (keeps remaining prefix contiguous).
 */
export function removeContiguousFromVolume(
  prev: OutlineIndex,
  volumeId: string,
  filename: string,
  chapterOrder: string[]
): OutlineIndex {
  const idx = orderIndexMap(chapterOrder);
  const at = idx.get(filename);
  if (at === undefined) return prev;
  const owner = ownerMap(prev.volumes);
  if (owner.get(filename) !== volumeId) return prev;
  for (let i = at; i < chapterOrder.length; i++) {
    if (owner.get(chapterOrder[i]!) === volumeId) owner.delete(chapterOrder[i]!);
  }
  return rebuildFromOwner(prev, chapterOrder, owner);
}

export function sortVolumesByOrder(volumes: VolumeOutline[]): VolumeOutline[] {
  return sortVolumes(volumes);
}
