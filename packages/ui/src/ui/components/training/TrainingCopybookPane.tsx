import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getTrainingCopybookChapter,
  putTrainingCopybookProgress,
  putTrainingCopybookChapterSource
} from "../../api";
import { useSyncScrollPair } from "../../hooks/useSyncScrollPair";
import { applyLocalMobileLayout } from "../../utils/localMobileLayout";
import { TrainingWorkbenchSplit } from "./TrainingWorkbenchSplit";

function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return e.message.trim() || "请求失败";
}

type CopybookChapterContextValue = {
  title: string;
  sourceText: string;
  draftText: string;
  saving: boolean;
  setSourceText: (text: string) => void;
  setDraftText: (text: string) => void;
  scheduleSourceSave: (text: string) => void;
  scheduleDraftSave: (text: string, cursorPos: number) => void;
  flushSaves: () => Promise<void>;
  applySourceLayout: () => void;
};

const CopybookChapterContext = createContext<CopybookChapterContextValue | null>(null);

function useCopybookChapter() {
  const ctx = useContext(CopybookChapterContext);
  if (!ctx) throw new Error("CopybookChapterProvider required");
  return ctx;
}

export function CopybookChapterProvider(props: {
  bookId: string;
  chapterIndex: number;
  disabled?: boolean;
  onStatus?: (msg: string) => void;
  onProgressSaved?: () => void;
  children: React.ReactNode;
}) {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceTextState] = useState("");
  const [draftText, setDraftTextState] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<{ draftText: string; cursorPos: number } | null>(null);
  const pendingSourceRef = useRef<string | null>(null);
  const loadKeyRef = useRef("");
  const onProgressSavedRef = useRef(props.onProgressSaved);
  const onStatusRef = useRef(props.onStatus);

  useEffect(() => {
    onProgressSavedRef.current = props.onProgressSaved;
    onStatusRef.current = props.onStatus;
  });

  const flushSaves = useCallback(async () => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (sourceTimerRef.current) {
      clearTimeout(sourceTimerRef.current);
      sourceTimerRef.current = null;
    }
    const pendingDraft = pendingDraftRef.current;
    const pendingSource = pendingSourceRef.current;
    pendingDraftRef.current = null;
    pendingSourceRef.current = null;
    if (!pendingDraft && pendingSource == null) return;
    setSaving(true);
    try {
      if (pendingSource != null) {
        await putTrainingCopybookChapterSource(props.bookId, props.chapterIndex, pendingSource);
      }
      if (pendingDraft) {
        await putTrainingCopybookProgress(props.bookId, props.chapterIndex, pendingDraft);
      }
      onProgressSavedRef.current?.();
    } catch (e: unknown) {
      onStatusRef.current?.(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }, [props.bookId, props.chapterIndex]);

  const flushSavesRef = useRef(flushSaves);
  flushSavesRef.current = flushSaves;

  const scheduleDraftSave = useCallback(
    (text: string, cursorPos: number) => {
      pendingDraftRef.current = { draftText: text, cursorPos };
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => void flushSavesRef.current(), 2000);
    },
    []
  );

  const scheduleSourceSave = useCallback(
    (text: string) => {
      pendingSourceRef.current = text;
      if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current);
      sourceTimerRef.current = setTimeout(() => void flushSavesRef.current(), 2000);
    },
    []
  );

  const applySourceLayout = useCallback(() => {
    setSourceTextState((prev) => {
      const next = applyLocalMobileLayout(prev);
      scheduleSourceSave(next);
      return next;
    });
  }, [scheduleSourceSave]);

  useEffect(() => {
    let cancelled = false;
    const loadKey = `${props.bookId}:${props.chapterIndex}`;
    loadKeyRef.current = loadKey;
    setReady(false);
    void (async () => {
      try {
        await flushSavesRef.current();
        const data = await getTrainingCopybookChapter(props.bookId, props.chapterIndex);
        if (cancelled || loadKeyRef.current !== loadKey) return;
        setTitle(data.title);
        setSourceTextState(data.text);
        setDraftTextState(data.draftText ?? "");
        setReady(true);
      } catch (e: unknown) {
        if (!cancelled) onStatusRef.current?.(formatApiError(e));
      }
    })();
    return () => {
      cancelled = true;
      void flushSavesRef.current();
    };
  }, [props.bookId, props.chapterIndex]);

  const value = useMemo(
    (): CopybookChapterContextValue => ({
      title,
      sourceText,
      draftText,
      saving,
      setSourceText: setSourceTextState,
      setDraftText: setDraftTextState,
      scheduleSourceSave,
      scheduleDraftSave,
      flushSaves,
      applySourceLayout
    }),
    [
      title,
      sourceText,
      draftText,
      saving,
      scheduleSourceSave,
      scheduleDraftSave,
      flushSaves,
      applySourceLayout
    ]
  );

  if (!ready) {
    return <p className="muted trainingCopybookLoading">加载章节…</p>;
  }

  return <CopybookChapterContext.Provider value={value}>{props.children}</CopybookChapterContext.Provider>;
}

function CopybookWorkbenchHead(props: { onBack?: () => void }) {
  const ctx = useCopybookChapter();

  return (
    <header className="trainingCopybookWorkbenchHead">
      {props.onBack ? (
        <button type="button" className="trainingCopybookBackBtn" onClick={props.onBack}>
          ← 返回
        </button>
      ) : null}
      <h2 className="trainingCopybookWorkbenchTitle">{ctx.title}</h2>
      <div className="trainingCopybookWorkbenchHeadActions">
        {ctx.saving ? <span className="muted trainingCopybookSavingMark">保存中…</span> : null}
        <button
          type="button"
          className="btnModalPrimary trainingCopybookLayoutBtn"
          disabled={!ctx.sourceText.trim()}
          onClick={() => ctx.applySourceLayout()}
        >
          排版
        </button>
      </div>
    </header>
  );
}

const CopybookTextPane = React.memo(function CopybookTextPane(props: {
  scrollRef?: React.Ref<HTMLDivElement>;
  kind: "source" | "draft";
}) {
  const ctx = useCopybookChapter();
  const isSource = props.kind === "source";

  return (
    <div className="trainingCopybookCol trainingCopybookCol--fill">
      <div ref={props.scrollRef} className="trainingCopybookScroll">
        <textarea
          className={`trainingTextarea trainingCopybookEdit${
            isSource ? " trainingCopybookSourceEdit" : " trainingCopybookDraftEdit"
          }`}
          value={isSource ? ctx.sourceText : ctx.draftText}
          spellCheck={false}
          onChange={(e) => {
            if (isSource) {
              ctx.setSourceText(e.target.value);
              ctx.scheduleSourceSave(e.target.value);
            } else {
              const next = e.target.value;
              ctx.setDraftText(next);
              ctx.scheduleDraftSave(next, e.target.selectionStart ?? next.length);
            }
          }}
          placeholder={isSource ? undefined : "在此对照抄写…"}
        />
      </div>
    </div>
  );
});

export function CopybookChapterWorkbench(props: {
  bookId: string;
  chapterIndex: number;
  disabled?: boolean;
  onBack?: () => void;
  onStatus?: (msg: string) => void;
  onProgressSaved?: () => void;
}) {
  const scrollKey = `${props.bookId}:${props.chapterIndex}`;
  const { leftRef, rightRef } = useSyncScrollPair(true, scrollKey);

  return (
    <CopybookChapterProvider {...props}>
      <div className="trainingCopybookWorkbench">
        <CopybookWorkbenchHead onBack={props.onBack} />
        <TrainingWorkbenchSplit
          mode="copybook"
          center={
            <div className="trainingCopybookPaneWrap">
              <CopybookTextPane kind="source" scrollRef={leftRef} />
            </div>
          }
          right={
            <div className="trainingCopybookPaneWrap">
              <CopybookTextPane kind="draft" scrollRef={rightRef} />
            </div>
          }
        />
      </div>
    </CopybookChapterProvider>
  );
}
