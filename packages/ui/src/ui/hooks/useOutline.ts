import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOutlineAiPreview,
  generateOutlineAi,
  getOutline,
  patchOutline,
  type OutlineAiMode,
  type OutlineIndex
} from "../api";

export function useOutline(slug: string | null) {
  const [outline, setOutline] = useState<OutlineIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);

  const load = useCallback(async () => {
    if (!slug) {
      setOutline(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const { outline: idx } = await getOutline(slug);
      skipNextSave.current = true;
      setOutline(idx);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNow = useCallback(
    async (next: OutlineIndex) => {
      if (!slug) return;
      setSaving(true);
      setErr("");
      try {
        const { outline: saved } = await patchOutline(slug, next);
        skipNextSave.current = true;
        setOutline(saved);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    },
    [slug]
  );

  const updateOutline = useCallback(
    (updater: (prev: OutlineIndex) => OutlineIndex) => {
      setOutline((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void saveNow(next);
        }, 1000);
        return next;
      });
    },
    [saveNow]
  );

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
  }, [outline]);

  const runAi = useCallback(
    async (input: {
      mode: OutlineAiMode;
      modelConfigId?: string | null;
      instruction?: string;
      volumeId?: string;
      chapterFilename?: string;
      options?: Parameters<typeof generateOutlineAi>[1]["options"];
    }) => {
      if (!slug) throw new Error("未选择书籍");
      setAiBusy(true);
      setErr("");
      try {
        return await generateOutlineAi(slug, input);
      } catch (e: any) {
        const msg = e?.message || String(e);
        setErr(msg);
        throw e;
      } finally {
        setAiBusy(false);
      }
    },
    [slug]
  );

  const applyPreview = useCallback(
    async (preview: Partial<OutlineIndex> | { report: string }, overwrite?: boolean) => {
      if (!slug) return null;
      setAiBusy(true);
      setErr("");
      try {
        const { outline: saved, warnings } = await applyOutlineAiPreview(slug, { preview, overwrite });
        skipNextSave.current = true;
        setOutline(saved);
        if (warnings?.length) setErr(warnings.join("；"));
        return saved;
      } catch (e: any) {
        setErr(e?.message || String(e));
        throw e;
      } finally {
        setAiBusy(false);
      }
    },
    [slug]
  );

  return {
    outline,
    setOutline,
    loading,
    saving,
    aiBusy,
    err,
    setErr,
    load,
    saveNow,
    updateOutline,
    runAi,
    applyPreview
  };
}
