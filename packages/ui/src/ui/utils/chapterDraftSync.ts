export function isDraftOutOfSync(
  latestHistoryHash: string | null | undefined,
  currentHash: string
): boolean {
  if (!latestHistoryHash) return true;
  return latestHistoryHash !== currentHash;
}

export function mergeDraftOutOfSyncSet(
  serverOutOfSync: string[],
  activeFilename: string | null,
  currentChapterHash: string | null,
  latestHistoryHash: string | null
): Set<string> {
  const s = new Set(serverOutOfSync);
  if (activeFilename && currentChapterHash != null) {
    if (isDraftOutOfSync(latestHistoryHash, currentChapterHash)) s.add(activeFilename);
    else s.delete(activeFilename);
  }
  return s;
}
