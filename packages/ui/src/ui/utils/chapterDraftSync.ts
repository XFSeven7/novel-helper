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
  latestHistoryHash: string | null | undefined
): Set<string> {
  const s = new Set(serverOutOfSync);
  if (!activeFilename || currentChapterHash == null) return s;
  // 尚未拉取到最新存稿 hash 时，仅以服务端 draft-status 为准，避免误标 *
  if (latestHistoryHash === undefined) return s;
  if (isDraftOutOfSync(latestHistoryHash, currentChapterHash)) s.add(activeFilename);
  else s.delete(activeFilename);
  return s;
}
