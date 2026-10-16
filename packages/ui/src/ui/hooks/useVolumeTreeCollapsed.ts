import { useCallback } from "react";
import { EMPTY_STRING_ARR, useBookUiPrefField } from "../uiPrefs/UiPrefsContext";

/** Shared expand/collapse for chapter-nav + outline 章纲 volume trees (default expanded). */
export function useVolumeTreeCollapsed(bookId: string | null | undefined) {
  const [collapsedIds, setCollapsedIds] = useBookUiPrefField(
    bookId || "",
    "outline",
    "volumeTreeCollapsedIds",
    EMPTY_STRING_ARR
  );

  const isExpanded = useCallback(
    (key: string) => !collapsedIds.includes(key),
    [collapsedIds]
  );

  const toggle = useCallback(
    (key: string) => {
      if (!bookId) return;
      setCollapsedIds((prev) =>
        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      );
    },
    [bookId, setCollapsedIds]
  );

  return { isExpanded, toggle };
}
