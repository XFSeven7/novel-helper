import { useCallback, useEffect, useState } from "react";
import {
  createBookNoteEntry,
  createBookNotesNotebook,
  deleteBookNoteEntry,
  deleteBookNotesNotebook,
  fetchBookNotes,
  patchBookNoteEntry,
  patchBookNotesNotebook,
  type BookNoteEntry,
  type BookNotesIndex
} from "../api";

export function useBookNotes(bookId: string | null) {
  const [index, setIndex] = useState<BookNotesIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!bookId) {
      setIndex(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchBookNotes(bookId);
      setIndex(res.index);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<{ index: BookNotesIndex }>) => {
      if (!bookId) return;
      setError("");
      try {
        const res = await fn();
        setIndex(res.index);
        return res.index;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [bookId]
  );

  return {
    index,
    loading,
    error,
    reload,
    addNotebook: (name: string) => run(() => createBookNotesNotebook(bookId!, name)),
    renameNotebook: (notebookId: string, name: string) =>
      run(() => patchBookNotesNotebook(bookId!, notebookId, { name })),
    removeNotebook: (notebookId: string) => run(() => deleteBookNotesNotebook(bookId!, notebookId)),
    addEntry: (notebookId: string, content: string) =>
      run(() => createBookNoteEntry(bookId!, notebookId, content)),
    patchEntry: (
      entryId: string,
      patch: { content?: string; pinned?: boolean; notebookId?: string }
    ) => run(() => patchBookNoteEntry(bookId!, entryId, patch)),
    removeEntry: (entryId: string) => run(() => deleteBookNoteEntry(bookId!, entryId))
  };
}

export function sortNoteEntries(entries: BookNoteEntry[], sortDesc: boolean): BookNoteEntry[] {
  return [...entries].sort((a, b) => {
    const ap = Boolean(a.pinned);
    const bp = Boolean(b.pinned);
    if (ap !== bp) return ap ? -1 : 1;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return sortDesc ? tb - ta : ta - tb;
  });
}
