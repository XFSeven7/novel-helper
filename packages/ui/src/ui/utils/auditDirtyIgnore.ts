const STORAGE_KEY = "novelHelper:auditDirtyIgnore";

export function auditDirtyIgnoreKey(bookSlug: string, chapterFilename: string) {
  return `${bookSlug}::${chapterFilename}`;
}

export function readAuditDirtyIgnoreStore(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeAuditDirtyIgnoreStore(store: Record<string, string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
}

export function setAuditDirtyIgnoreEntry(
  store: Record<string, string>,
  bookSlug: string,
  chapterFilename: string,
  contentHash: string
): Record<string, string> {
  const key = auditDirtyIgnoreKey(bookSlug, chapterFilename);
  const next = { ...store, [key]: contentHash };
  writeAuditDirtyIgnoreStore(next);
  return next;
}

export function clearAuditDirtyIgnoreEntry(
  store: Record<string, string>,
  bookSlug: string,
  chapterFilename: string
): Record<string, string> {
  const key = auditDirtyIgnoreKey(bookSlug, chapterFilename);
  if (!(key in store)) return store;
  const next = { ...store };
  delete next[key];
  writeAuditDirtyIgnoreStore(next);
  return next;
}

export function filterStaleChaptersWithIgnore(
  bookSlug: string,
  staleFilenames: Iterable<string>,
  currentHashByFilename: Record<string, string>,
  ignoreStore: Record<string, string>
): Set<string> {
  const next = new Set<string>();
  for (const fn of staleFilenames) {
    const ignored = ignoreStore[auditDirtyIgnoreKey(bookSlug, fn)];
    const current = currentHashByFilename[fn];
    if (ignored && current && ignored === current) continue;
    next.add(fn);
  }
  return next;
}
