import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOutlineAiPreview,
  generateOutlineAi,
  getOutline,
  patchOutline,
  type OutlineAiMode,
  type OutlineIndex
} from "../api";

export function useOutline(slug: string | null, refreshToken = 0) {
  const [outline, setOutline] = useState<OutlineIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);
  const outlineRef = useRef<OutlineIndex | null>(null);
  const savingPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);

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
  }, [load, refreshToken]);

  const saveNow = useCallback(
    async (next: OutlineIndex, opts?: { throwOnError?: boolean }) => {
      if (!slug) return;
      const run = async () => {
        setSaving(true);
        setErr("");
        try {
          const { outline: saved } = await patchOutline(slug, next);
          skipNextSave.current = true;
          setOutline(saved);
        } catch (e: any) {
          const msg = e?.message || String(e);
          setErr(msg);
          if (opts?.throwOnError) throw e;
        } finally {
          setSaving(false);
        }
      };
      const p = run();
      savingPromiseRef.current = p;
      try {
        await p;
      } finally {
        if (savingPromiseRef.current === p) savingPromiseRef.current = null;
      }
    },
    [slug]
  );

  /** 发送阶段策划等请求前：落盘待保存的大纲，避免服务端找不到新建阶段 */
  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const current = outlineRef.current;
      if (current) await saveNow(current, { throwOnError: true });
      return;
    }
    if (savingPromiseRef.current) {
      await savingPromiseRef.current;
    }
  }, [saveNow]);

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

  /** 服务端已持久化（如阶段 AI 流结束），仅同步内存，不触发 saving / 二次保存 */
  const replaceOutlineFromServer = useCallback((next: OutlineIndex) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    skipNextSave.current = true;
    setOutline(next);
  }, []);

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
    flushPendingSave,
    updateOutline,
    replaceOutlineFromServer,
    runAi,
    applyPreview
  };
}
