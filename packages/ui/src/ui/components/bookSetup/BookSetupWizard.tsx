import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookMeta, BookSetupChatSuggestion, BookSetupDraft, BookSetupStepId } from "../../api";
import {
  applyBookSetupStep,
  redesignBookSetupMainline,
  chatBookSetupStep,
  clearStoredBookSetupSessionId,
  commitBookSetupSession,
  createBookSetupSession,
  getBookSetupSession,
  getStoredBookSetupSessionId,
  patchBookSetupSession,
  setStoredBookSetupSessionId
} from "../../api";
import { OutlineAiPreviewVisual } from "../outline/OutlineAiPreviewVisual";

const STEPS: Array<{ id: BookSetupStepId; title: string; hint: string }> = [
  { id: "intent", title: "你想写什么？", hint: "题材、创作概念、想达成的阅读体验。可参考 InkOS 建书对话：先定方向再细化。" },
  { id: "scale", title: "体量与结构", hint: "目标字数、章数、结构框架（三幕式等）。" },
  { id: "logline", title: "一句话梗概", hint: "可验证的终局方向，避免空话。" },
  { id: "synopsis", title: "故事梗概（五段）", hint: "起因/发展/转折/高潮/结局；可含前台线与后台线。" },
  {
    id: "mainline",
    title: "主线阶段",
    hint: "右侧讨论主线；可「应用到本步」增量同步，或「重新整理阶段」根据对话整体重规划左侧阶段列表。"
  },
  { id: "volumes", title: "分卷规划", hint: "各卷主题与卷摘要；创建后再在大纲 Tab 细调。" },
  { id: "chapterSkeleton", title: "章纲骨架（可选）", hint: "可跳过；创建后在大纲里用 AI 雪花/章纲补充。" },
  { id: "meta", title: "书名与简介", hint: "书名必填；简介写入 meta.json。" },
  { id: "review", title: "总览并创建", hint: "确认后才会在本地创建书籍文件夹。" }
];

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i])) as Record<BookSetupStepId, number>;

const TAB_LABELS: Record<BookSetupStepId, string> = {
  intent: "意向",
  scale: "体量",
  logline: "一句",
  synopsis: "梗概",
  mainline: "主线",
  volumes: "分卷",
  chapterSkeleton: "章纲",
  meta: "书名",
  review: "总览"
};

function ensureVisitedSteps(draft: BookSetupDraft): BookSetupDraft {
  if (draft.visitedSteps?.length) return draft;
  const idx = STEP_INDEX[draft.currentStep] ?? 0;
  return { ...draft, visitedSteps: STEPS.slice(0, idx + 1).map((s) => s.id) };
}

function markStep(draft: BookSetupDraft, stepId: BookSetupStepId): BookSetupDraft {
  const base = ensureVisitedSteps(draft);
  const visited = base.visitedSteps?.includes(stepId)
    ? base.visitedSteps
    : [...(base.visitedSteps ?? []), stepId];
  return { ...base, currentStep: stepId, visitedSteps: visited };
}

function applySuggestionToDraft(draft: BookSetupDraft, stepId: BookSetupStepId, s: BookSetupChatSuggestion): BookSetupDraft {
  const next = { ...draft, outline: { ...draft.outline, book: { ...draft.outline.book } } };
  if (s.concept != null) next.concept = s.concept;
  if (s.genreNotes != null) next.genreNotes = s.genreNotes;
  if (s.targetWords != null) next.targetWords = s.targetWords;
  if (s.targetChapters != null) next.targetChapters = s.targetChapters;
  if (s.structureFramework != null) next.structureFramework = s.structureFramework;
  if (s.title != null) next.title = s.title;
  if (s.metaSynopsis != null) next.metaSynopsis = s.metaSynopsis;
  if (s.logline != null) next.outline.book.logline = s.logline;
  if (s.synopsis) next.outline.book.synopsis = { ...next.outline.book.synopsis, ...s.synopsis };
  if (s.mainlineStages !== undefined) {
    next.outline.book.mainlineStages = s.mainlineStages.map((st, i) => ({
      id: st.id || `stage-${Date.now()}-${i}`,
      label: st.label ?? "",
      chapterRange: st.chapterRange ?? "",
      note: st.note ?? ""
    }));
  }
  if (s.volumes?.length) {
    next.outline.volumes = s.volumes.map((v, i) => ({
      id: `vol-${Date.now()}-${i}`,
      title: v.title,
      order: v.order,
      synopsis: v.synopsis ?? "",
      chapterFilenames: []
    }));
  }
  return next;
}

function suggestionApplies(stepId: BookSetupStepId, s: BookSetupChatSuggestion): boolean {
  switch (stepId) {
    case "intent":
      return s.concept != null || s.genreNotes != null;
    case "scale":
      return s.targetWords != null || s.targetChapters != null || s.structureFramework != null;
    case "logline":
      return s.logline != null;
    case "synopsis":
      return s.synopsis != null;
    case "mainline":
      return s.mainlineStages !== undefined;
    case "volumes":
      return !!(s.volumes && s.volumes.length > 0);
    case "meta":
      return s.title != null || s.metaSynopsis != null;
    default:
      return Object.keys(s).length > 0;
  }
}

function mergeDraftPatch(draft: BookSetupDraft, patch: Partial<BookSetupDraft>): BookSetupDraft {
  const next: BookSetupDraft = { ...draft, ...patch };
  if (patch.outline) {
    next.outline = {
      ...draft.outline,
      ...patch.outline,
      book: { ...draft.outline.book, ...(patch.outline.book ?? {}) },
      volumes: patch.outline.volumes ?? draft.outline.volumes,
      ungroupedFilenames: patch.outline.ungroupedFilenames ?? draft.outline.ungroupedFilenames,
      chapterPlans: patch.outline.chapterPlans ?? draft.outline.chapterPlans
    };
  }
  return next;
}

const PERSIST_DEBOUNCE_MS = 400;

export type BookSetupWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (book: BookMeta) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  activeModelId: string | null;
  onStatus?: (msg: string) => void;
};

export function BookSetupWizard({ open, onClose, onCreated, busy, setBusy, activeModelId, onStatus }: BookSetupWizardProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookSetupDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusyMode, setChatBusyMode] = useState<"idle" | "send" | "apply" | "redesign">("idle");
  const chatBusy = chatBusyMode !== "idle";
  const [lastSuggestion, setLastSuggestion] = useState<BookSetupChatSuggestion | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<BookSetupDraft | null>(null);

  const cancelPendingPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  }, []);

  const stepIdx = draft ? STEP_INDEX[draft.currentStep] : 0;
  const stepMeta = STEPS[stepIdx]!;

  const flushPersist = useCallback(async () => {
    const next = pendingPersistRef.current;
    const sid = sessionId;
    if (!next || !sid) return next;
    pendingPersistRef.current = null;
    try {
      const { draft: saved } = await patchBookSetupSession(sid, { draft: next });
      setDraft(saved);
      return saved;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return next;
    }
  }, [sessionId]);

  const schedulePersist = useCallback(
    (next: BookSetupDraft) => {
      pendingPersistRef.current = next;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        void flushPersist();
      }, PERSIST_DEBOUNCE_MS);
    },
    [flushPersist]
  );

  const persistNow = useCallback(
    async (next: BookSetupDraft) => {
      setDraft(next);
      cancelPendingPersist();
      if (!sessionId) return next;
      try {
        const { draft: saved } = await patchBookSetupSession(sessionId, { draft: next });
        setDraft(saved);
        return saved;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        return next;
      }
    },
    [sessionId, cancelPendingPersist]
  );

  useEffect(() => {
    if (open) return;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
    setChatInput("");
    setLastSuggestion(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const stored = getStoredBookSetupSessionId();
        if (stored) {
          try {
            const { draft: d } = await getBookSetupSession(stored);
            if (!cancelled) {
              setSessionId(stored);
              setDraft(ensureVisitedSteps(d));
              return;
            }
          } catch {
            clearStoredBookSetupSessionId();
          }
        }
        const { sessionId: id, draft: d } = await createBookSetupSession();
        if (!cancelled) {
          setSessionId(id);
          setStoredBookSetupSessionId(id);
          setDraft(ensureVisitedSteps(d));
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const stepId = draft?.currentStep ?? "intent";
  const isReview = stepId === "review";

  useEffect(() => {
    setLastSuggestion(null);
    setChatInput("");
  }, [stepId]);

  const goStep = async (id: BookSetupStepId) => {
    if (!draft) return;
    await persistNow(markStep(draft, id));
  };

  const skipStep = async () => {
    if (!draft) return;
    const skipped = draft.skippedSteps.includes(draft.currentStep)
      ? draft.skippedSteps
      : [...draft.skippedSteps, draft.currentStep];
    const i = stepIdx;
    if (i < STEPS.length - 1) {
      await persistNow(markStep({ ...draft, skippedSteps: skipped }, STEPS[i + 1]!.id));
    } else {
      await persistNow({ ...draft, skippedSteps: skipped });
    }
  };

  const nextStep = async () => {
    if (stepIdx < STEPS.length - 1) await goStep(STEPS[stepIdx + 1]!.id);
  };

  const prevStep = async () => {
    if (stepIdx > 0) await goStep(STEPS[stepIdx - 1]!.id);
  };

  const handleCommit = async () => {
    if (!sessionId || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const latest = (await flushPersist()) ?? draft;
      const { book } = await commitBookSetupSession(sessionId, { title: latest.title });
      clearStoredBookSetupSessionId();
      onStatus?.(`已创建书籍：${book.title}`);
      onCreated(book);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    if (!sessionId || !draft || !chatInput.trim() || chatBusy) return;
    const text = chatInput.trim();
    const step = draft.currentStep;
    const prior = draft.stepMessages[step] ?? [];
    const last = prior[prior.length - 1];
    if (last?.role === "user" && last.content.trim() === text) return;
    const optimistic: BookSetupDraft = {
      ...draft,
      stepMessages: {
        ...draft.stepMessages,
        [step]: [...(draft.stepMessages[step] ?? []), { role: "user", content: text }]
      }
    };
    setChatInput("");
    cancelPendingPersist();
    setDraft(optimistic);
    setChatBusyMode("send");
    setError(null);
    try {
      const res = await chatBookSetupStep(sessionId, {
        stepId: step,
        message: text,
        modelConfigId: activeModelId
      });
      setLastSuggestion(res.suggestion ?? null);
      let nextDraft: BookSetupDraft;
      if (res.draft) nextDraft = ensureVisitedSteps(res.draft);
      else {
        const { draft: d } = await getBookSetupSession(sessionId);
        nextDraft = ensureVisitedSteps(d);
      }
      if (step === "mainline" && nextDraft.outline.book.mainlineStages?.length) {
        onStatus?.(`已根据对话更新 ${nextDraft.outline.book.mainlineStages.length} 个主线阶段`);
      }
      cancelPendingPersist();
      setDraft(nextDraft);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      try {
        const { draft: d } = await getBookSetupSession(sessionId);
        setDraft(ensureVisitedSteps(d));
      } catch {
        setDraft(draft);
      }
    } finally {
      setChatBusyMode("idle");
    }
  };

  const applyFromChat = async () => {
    if (!sessionId || !draft || isReview) return;
    const messages = draft.stepMessages[stepId] ?? [];
    if (messages.length === 0) {
      setError("请先在右侧发送至少一条消息，再应用到本步");
      return;
    }
    cancelPendingPersist();
    setChatBusyMode("apply");
    setError(null);
    try {
      const synced = await persistNow(draft);
      const res = await applyBookSetupStep(sessionId, {
        stepId,
        modelConfigId: activeModelId
      });
      const hasSuggestion = !!(res.suggestion && suggestionApplies(stepId, res.suggestion));
      if (!hasSuggestion && !res.draft) {
        setError(res.assistantMessage || "未能从对话中提取可填写内容，请继续补充说明");
        return;
      }
      let next = ensureVisitedSteps(res.draft ?? synced);
      if (hasSuggestion) {
        next = applySuggestionToDraft(next, stepId, res.suggestion!);
      }
      const saved = await persistNow(next);
      setLastSuggestion(null);
      const finalDraft = saved ?? next;
      if (stepId === "mainline") {
        const n = finalDraft.outline.book.mainlineStages?.length ?? 0;
        onStatus?.(
          res.assistantMessage?.trim() ||
            (n > 0 ? `已根据对话更新 ${n} 个主线阶段` : "已根据对话同步主线阶段（当前为空）")
        );
      } else {
        onStatus?.(res.assistantMessage?.trim() || "已根据对话应用到本步");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatBusyMode("idle");
    }
  };

  const redesignMainline = async () => {
    if (!sessionId || !draft || stepId !== "mainline") return;
    const messages = draft.stepMessages.mainline ?? [];
    if (messages.length === 0) {
      setError("请先在右侧讨论主线，再重新整理阶段");
      return;
    }
    cancelPendingPersist();
    setChatBusyMode("redesign");
    setError(null);
    try {
      const synced = await persistNow(draft);
      const res = await redesignBookSetupMainline(sessionId, { modelConfigId: activeModelId });
      if (res.suggestion?.mainlineStages === undefined && !res.draft) {
        setError(res.assistantMessage || "未能生成新的阶段列表，请继续对话后重试");
        return;
      }
      let next = ensureVisitedSteps(res.draft ?? synced);
      if (res.suggestion?.mainlineStages !== undefined) {
        next = applySuggestionToDraft(next, "mainline", res.suggestion);
      }
      const saved = await persistNow(next);
      const finalDraft = saved ?? next;
      const n = finalDraft.outline.book.mainlineStages?.length ?? 0;
      onStatus?.(
        res.assistantMessage?.trim() ||
          (n > 0 ? `已重新规划 ${n} 个主线阶段` : "已清空主线阶段，请继续补充")
      );
      setDraft(finalDraft);
      setLastSuggestion(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatBusyMode("idle");
    }
  };

  const updateDraft = (patch: Partial<BookSetupDraft>) => {
    if (!draft) return;
    const next = mergeDraftPatch(draft, patch);
    setDraft(next);
    schedulePersist(next);
  };

  const missingReview = useMemo(() => {
    if (!draft) return [];
    const m: string[] = [];
    if (!draft.title?.trim()) m.push("书名");
    if (!draft.outline.book.logline?.trim()) m.push("一句话梗概");
    if (!draft.skippedSteps.includes("volumes") && draft.outline.volumes.length < 1) m.push("分卷");
    return m;
  }, [draft]);

  if (!open) return null;

  const visited = draft?.visitedSteps ?? [];

  return (
    <BookSetupBackdrop onClose={onClose} busy={busy}>
      <h2 className="modalHeading">规划新书</h2>
      <p className="muted bookSetupWizardIntro">
        左侧填写本步信息，右侧与 AI 讨论；主线步会随聊天自动更新阶段，其他步可点「应用到本步」。确认后创建本地书籍。
      </p>

      {error ? <div className="modalError">{error}</div> : null}

      {draft ? (
        <div className={`bookSetupSplit${isReview ? " bookSetupSplit--reviewOnly" : ""}`}>
          <div className="bookSetupFormPane">
            <BookSetupTabs
              current={stepId}
              visited={visited}
              disabled={busy || chatBusy}
              onSelect={(id) => void goStep(id)}
            />
            <div className="bookSetupFormScroll">
              <h3 className="bookSetupStepTitle">{stepMeta.title}</h3>
              <p className="muted bookSetupStepHint">{stepMeta.hint}</p>

              {isReview ? (
                <div className="bookSetupReview">
                  {missingReview.length ? (
                    <p className="muted">仍建议补充：{missingReview.join("、")}</p>
                  ) : null}
                  <OutlineAiPreviewVisual preview={draft.outline} chapters={[]} />
                </div>
              ) : (
                <BookSetupStepBody draft={draft} stepId={stepId} onChange={updateDraft} />
              )}
            </div>
            <BookSetupActions
              stepIdx={stepIdx}
              isReview={isReview}
              ready={draft.readyToCreate}
              busy={busy || chatBusy}
              onPrev={() => void prevStep()}
              onSkip={() => void skipStep()}
              onNext={() => void nextStep()}
              onCommit={() => void handleCommit()}
              onClose={onClose}
            />
          </div>

          {!isReview ? (
            <BookSetupChatPane
              messages={draft.stepMessages[stepId] ?? []}
              input={chatInput}
              onInput={setChatInput}
              onSend={() => void sendChat()}
              busy={chatBusy}
              canApply={(draft.stepMessages[stepId] ?? []).length > 0}
              onApply={() => void applyFromChat()}
              canRedesignMainline={stepId === "mainline" && (draft.stepMessages.mainline ?? []).length > 0}
              onRedesignMainline={() => void redesignMainline()}
              busyHint={
                chatBusyMode === "apply"
                  ? "正在从对话整理…"
                  : chatBusyMode === "redesign"
                    ? "正在重新规划主线阶段…"
                    : "思考中…"
              }
              nextQuestion={draft.nextQuestion}
            />
          ) : null}
        </div>
      ) : (
        <p className="muted">加载向导…</p>
      )}
    </BookSetupBackdrop>
  );
}

function BookSetupBackdrop({ children, onClose, busy }: { children: React.ReactNode; onClose: () => void; busy: boolean }) {
  return (
    <div
      className="modalBackdrop modalBackdropEditChar"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="modalPanel modalPanelOpaque modalPanelEditChar bookSetupWizard"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function BookSetupTabs({
  current,
  visited,
  disabled,
  onSelect
}: {
  current: BookSetupStepId;
  visited: BookSetupStepId[];
  disabled: boolean;
  onSelect: (id: BookSetupStepId) => void;
}) {
  return (
    <div className="bookSetupTabs" role="tablist" aria-label="建书步骤">
      {STEPS.map((s, i) => {
        const canVisit = visited.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={current === s.id}
            className={`bookSetupTab${current === s.id ? " bookSetupTabActive" : ""}`}
            disabled={disabled || !canVisit}
            title={s.title}
            onClick={() => onSelect(s.id)}
          >
            <span className="bookSetupTabNum">{i + 1}</span>
            {TAB_LABELS[s.id]}
          </button>
        );
      })}
    </div>
  );
}

type MainlineStage = NonNullable<BookSetupDraft["outline"]["book"]["mainlineStages"]>[number];

function BookSetupMainlineEditor({
  draft,
  stages,
  onChange
}: {
  draft: BookSetupDraft;
  stages: MainlineStage[];
  onChange: (p: Partial<BookSetupDraft>) => void;
}) {
  const book = draft.outline.book;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (stages.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= stages.length) setActiveIndex(stages.length - 1);
  }, [stages.length, activeIndex]);

  const setStages = (next: MainlineStage[]) => {
    onChange({ outline: { ...draft.outline, book: { ...book, mainlineStages: next } } });
  };

  const resizeStageCount = (count: number) => {
    const n = Math.max(0, Math.min(24, Math.floor(Number.isFinite(count) ? count : 0)));
    let next = [...stages];
    while (next.length < n) {
      next.push({
        id: `stage-${Date.now()}-${next.length}`,
        label: "",
        chapterRange: "",
        note: ""
      });
    }
    if (next.length > n) next = next.slice(0, n);
    setStages(next);
  };

  const updateStage = (index: number, patch: Partial<MainlineStage>) => {
    const next = stages.map((st, j) => (j === index ? { ...st, ...patch } : st));
    setStages(next);
  };

  const activeIdx = stages.length > 0 ? Math.min(activeIndex, stages.length - 1) : 0;
  const activeStage = stages.length > 0 ? stages[activeIdx] : null;

  const goStage = (delta: number) => {
    const next = activeIdx + delta;
    if (next < 0 || next >= stages.length) return;
    setActiveIndex(next);
  };

  const removeStage = (index: number) => {
    if (stages.length <= 1) return;
    setStages(stages.filter((_, j) => j !== index));
    if (activeIndex >= index && activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  const stageKey = (st: MainlineStage, i: number) => st.id || `idx-${i}`;

  return (
    <BookSetupFields>
      <div className="bookSetupMainlineStickyNav">
        <div className="bookSetupMainlineToolbar">
          <div className="bookSetupMainlineToolbarTitle">阶段快速调整</div>
          <div className="bookSetupMainlineToolbarRow">
            <label className="bookSetupMainlineCount">
              <span className="modalLabel">阶段数量</span>
              <input
                type="number"
                className="modalInput bookSetupMainlineCountInput"
                min={0}
                max={24}
                value={stages.length}
                onChange={(e) => resizeStageCount(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btnSort"
              onClick={() => {
                resizeStageCount(stages.length + 1);
                setActiveIndex(stages.length);
              }}
            >
              + 加一阶段
            </button>
          </div>
        </div>
        {stages.length > 0 ? (
          <div className="bookSetupMainlineChips" role="tablist" aria-label="阶段切换">
            {stages.map((st, i) => {
              const key = stageKey(st, i);
              const chipLabel = st.label?.trim() || "未命名";
              const selected = i === activeIdx;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`bookSetupMainlineChip${selected ? " bookSetupMainlineChipActive" : ""}`}
                  title={`编辑第 ${i + 1} 阶段`}
                  onClick={() => setActiveIndex(i)}
                >
                  <span className="bookSetupMainlineChipNum">第{i + 1}阶段</span>
                  <span className="bookSetupMainlineChipLabel">{chipLabel}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted bookSetupMainlineEmpty">暂无阶段，可设置数量或点击下方添加。</p>
        )}
      </div>

      {activeStage ? (() => {
        const st = activeStage;
        const i = activeIdx;
        const stageTitle = `第 ${i + 1} 阶段`;
        return (
          <div key={`${stageKey(st, i)}-panel`} className="bookSetupStageRow bookSetupStageRowActive">
            <div className="bookSetupStageHead">
              <h4 className="bookSetupStageTitle">{stageTitle}</h4>
              <div className="bookSetupStageActions">
                <button
                  type="button"
                  className="btnSort bookSetupStageActBtn"
                  disabled={i === 0}
                  title="上一阶段"
                  aria-label="上一阶段"
                  onClick={() => goStage(-1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btnSort bookSetupStageActBtn"
                  disabled={i === stages.length - 1}
                  title="下一阶段"
                  aria-label="下一阶段"
                  onClick={() => goStage(1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btnSort bookSetupStageActBtn bookSetupStageActBtnDanger"
                  disabled={stages.length <= 1}
                  title="删除本阶段"
                  aria-label={`删除${stageTitle}`}
                  onClick={() => removeStage(i)}
                >
                  删除
                </button>
              </div>
            </div>
            <label className="modalLabel">{stageTitle} · 阶段名</label>
            <input
              className="modalInput"
              placeholder="如：蛰伏立足"
              value={st.label}
              onChange={(e) => updateStage(i, { label: e.target.value })}
            />
            <label className="modalLabel">{stageTitle} · 章范围示意</label>
            <input
              className="modalInput"
              placeholder="如 1–30"
              value={st.chapterRange ?? ""}
              onChange={(e) => updateStage(i, { chapterRange: e.target.value })}
            />
            <label className="modalLabel">{stageTitle} · 备注</label>
            <textarea
              className="modalTextarea"
              rows={3}
              placeholder="本阶段剧情走向、冲突与转折等，便于后续写章时对照"
              value={st.note ?? ""}
              onChange={(e) => updateStage(i, { note: e.target.value })}
            />
          </div>
        );
      })() : null}

      <button
        type="button"
        className="btnSort"
        onClick={() => {
          setStages([
            ...stages,
            { id: `stage-${Date.now()}`, label: "", chapterRange: "", note: "" }
          ]);
          setActiveIndex(stages.length);
        }}
      >
        + 添加阶段
      </button>
    </BookSetupFields>
  );
}

function BookSetupStepBody({
  draft,
  stepId,
  onChange
}: {
  draft: BookSetupDraft;
  stepId: BookSetupStepId;
  onChange: (p: Partial<BookSetupDraft>) => void;
}) {
  const book = draft.outline.book;
  const syn = book.synopsis ?? {};

  if (stepId === "intent") {
    return (
      <BookSetupFields>
        <label className="modalLabel">创作概念</label>
        <textarea
          className="modalTextarea"
          rows={4}
          value={draft.concept ?? ""}
          onChange={(e) => onChange({ concept: e.target.value })}
        />
        <label className="modalLabel">题材 / 类型备注</label>
        <input
          className="modalInput"
          value={draft.genreNotes ?? ""}
          onChange={(e) => onChange({ genreNotes: e.target.value })}
        />
      </BookSetupFields>
    );
  }

  if (stepId === "scale") {
    return (
      <BookSetupFields>
        <label className="modalLabel">目标总字数</label>
        <input
          className="modalInput"
          type="number"
          value={draft.targetWords ?? ""}
          onChange={(e) => onChange({ targetWords: Number(e.target.value) || undefined })}
        />
        <label className="modalLabel">目标章数</label>
        <input
          className="modalInput"
          type="number"
          value={draft.targetChapters ?? ""}
          onChange={(e) => onChange({ targetChapters: Number(e.target.value) || undefined })}
        />
        <label className="modalLabel">结构框架</label>
        <input
          className="modalInput"
          placeholder="如：三幕式、四幕式"
          value={draft.structureFramework ?? ""}
          onChange={(e) => onChange({ structureFramework: e.target.value })}
        />
      </BookSetupFields>
    );
  }

  if (stepId === "logline") {
    return (
      <textarea
        className="modalTextarea"
        rows={3}
        value={book.logline ?? ""}
        onChange={(e) =>
          onChange({
            outline: { ...draft.outline, book: { ...book, logline: e.target.value } }
          })
        }
      />
    );
  }

  if (stepId === "synopsis") {
    const fields: Array<{ key: keyof NonNullable<typeof syn>; label: string }> = [
      { key: "setup", label: "起因" },
      { key: "development", label: "发展" },
      { key: "twist", label: "转折" },
      { key: "climax", label: "高潮" },
      { key: "ending", label: "结局" }
    ];
    return (
      <BookSetupFields>
        {fields.map((f) => (
          <div key={f.key}>
            <label className="modalLabel">{f.label}</label>
            <textarea
              className="modalTextarea"
              rows={2}
              value={syn[f.key] ?? ""}
              onChange={(e) =>
                onChange({
                  outline: {
                    ...draft.outline,
                    book: { ...book, synopsis: { ...syn, [f.key]: e.target.value } }
                  }
                })
              }
            />
          </div>
        ))}
      </BookSetupFields>
    );
  }

  if (stepId === "mainline") {
    const stages = book.mainlineStages ?? [];
    const mainlineKey = stages.map((s) => `${s.id}|${s.label}|${s.chapterRange}|${s.note ?? ""}`).join(";;") || "empty";
    return <BookSetupMainlineEditor key={mainlineKey} draft={draft} stages={stages} onChange={onChange} />;
  }

  if (stepId === "volumes") {
    const vols = draft.outline.volumes;
    return (
      <BookSetupFields>
        {vols.map((v, i) => (
          <div key={v.id} className="bookSetupVolumeRow">
            <input
              className="modalInput"
              placeholder="卷标题"
              value={v.title}
              onChange={(e) => {
                const next = vols.map((x, j) => (j === i ? { ...x, title: e.target.value } : x));
                onChange({ outline: { ...draft.outline, volumes: next } });
              }}
            />
            <textarea
              className="modalTextarea"
              rows={2}
              placeholder="卷摘要"
              value={v.synopsis ?? ""}
              onChange={(e) => {
                const next = vols.map((x, j) => (j === i ? { ...x, synopsis: e.target.value } : x));
                onChange({ outline: { ...draft.outline, volumes: next } });
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btnSort"
          onClick={() => {
            const order = vols.length ? Math.max(...vols.map((v) => v.order)) + 1 : 1;
            onChange({
              outline: {
                ...draft.outline,
                volumes: [
                  ...vols,
                  {
                    id: `vol-${Date.now()}`,
                    title: `第${order}卷`,
                    order,
                    synopsis: "",
                    chapterFilenames: []
                  }
                ]
              }
            });
          }}
        >
          + 添加一卷
        </button>
      </BookSetupFields>
    );
  }

  if (stepId === "chapterSkeleton") {
    return <p className="muted">本章纲骨架可跳过；创建后在大纲 Tab 使用 AI 补充章纲。</p>;
  }

  if (stepId === "meta") {
    return (
      <BookSetupFields>
        <label className="modalLabel">
          书名<span className="modalReq">*</span>
        </label>
        <input
          className="modalInput"
          value={draft.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <label className="modalLabel">书籍简介（meta.json）</label>
        <textarea
          className="modalTextarea"
          rows={4}
          value={draft.metaSynopsis ?? ""}
          onChange={(e) => onChange({ metaSynopsis: e.target.value })}
        />
      </BookSetupFields>
    );
  }

  return null;
}

function BookSetupFields({ children }: { children: React.ReactNode }) {
  return <div className="bookSetupFields">{children}</div>;
}

/** 历史消息若含未解析的 JSON，只展示自然语言部分 */
function formatAssistantChatText(content: string): string {
  let t = content.trim().replace(/```(?:json)?\s*[\s\S]*?```/gi, (block) => {
    try {
      const inner = block.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const obj = JSON.parse(inner) as { assistantMessage?: string };
      if (obj.assistantMessage?.trim()) return obj.assistantMessage.trim();
    } catch {
      /* */
    }
    return "";
  }).trim();
  if (!t.includes("{") && !t.includes("assistantMessage")) return t || content.trim();
  if (!t.includes('"assistantMessage"')) return t;
  const jsonStart = t.indexOf("{");
  if (jsonStart < 0) return t;
  const preamble = jsonStart > 0 ? t.slice(0, jsonStart).trim() : "";
  try {
    const jsonEnd = t.lastIndexOf("}");
    if (jsonEnd <= jsonStart) return preamble || t;
    const obj = JSON.parse(t.slice(jsonStart, jsonEnd + 1)) as { assistantMessage?: string };
    const msg = obj.assistantMessage?.trim();
    if (msg) return preamble ? `${preamble}\n\n${msg}` : msg;
    return preamble || t;
  } catch {
    return preamble || t;
  }
}

function BookSetupChatPane({
  messages,
  input,
  onInput,
  onSend,
  busy,
  canApply,
  onApply,
  canRedesignMainline,
  onRedesignMainline,
  busyHint,
  nextQuestion
}: {
  messages: Array<{ role: string; content: string }>;
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  canApply: boolean;
  onApply: () => void;
  canRedesignMainline?: boolean;
  onRedesignMainline?: () => void;
  busyHint?: string;
  nextQuestion?: string;
}) {
  const chatLogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!busy) focusInput();
  }, [busy, focusInput]);

  const handleSend = () => {
    if (busy || !input.trim()) return;
    onSend();
    focusInput();
  };

  return (
    <aside className="bookSetupChatPane" aria-label="本步 AI 对话">
      <div className="bookSetupChatPaneTitle">本步 AI 助手</div>
      <div className="bookSetupChatPanel">
        <div ref={chatLogRef} className="bookSetupChatLog">
          {messages.length === 0 && !busy ? (
            <p className="muted bookSetupChatEmpty">在本步聊聊你的想法，AI 会给出可填入左侧的建议。</p>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "bookSetupChatBubble bookSetupChatBubbleUser" : "bookSetupChatBubble bookSetupChatBubbleAi"
                }
              >
                <div className="bookSetupChatBubbleRole">{m.role === "user" ? "你" : "AI"}</div>
                <div className="bookSetupChatBubbleBody">
                  {m.role === "assistant" ? formatAssistantChatText(m.content) : m.content}
                </div>
              </div>
            ))
          )}
          {busy ? (
            <div className="bookSetupChatBubble bookSetupChatBubbleAi bookSetupChatPending">
              <div className="bookSetupChatBubbleRole">AI</div>
              <div className="bookSetupChatBubbleBody muted">{busyHint ?? "思考中…"}</div>
            </div>
          ) : null}
        </div>
        {nextQuestion && !busy ? (
          <p className="muted bookSetupChatHint">建议思考：{nextQuestion}</p>
        ) : null}
        <div className="bookSetupChatComposer">
          <div className="bookSetupChatInputRow">
            <textarea
              ref={inputRef}
              className="modalTextarea bookSetupChatTextarea"
              rows={2}
              placeholder="输入消息…"
              value={input}
              disabled={busy}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              className="btnSort bookSetupChatSendBtn"
              disabled={busy || !input.trim()}
              onClick={handleSend}
            >
              发送
            </button>
          </div>
          {canApply || canRedesignMainline ? (
            <div className="bookSetupChatApplyRow">
              {canApply ? (
                <button type="button" className="btnSort bookSetupApplyBtn" disabled={busy} onClick={onApply}>
                  应用到本步
                </button>
              ) : null}
              {canRedesignMainline ? (
                <button
                  type="button"
                  className="btnSort bookSetupRedesignBtn"
                  disabled={busy}
                  title="根据当前对话整体重排、合并或重写全部主线阶段"
                  onClick={onRedesignMainline}
                >
                  重新整理阶段
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function BookSetupActions({
  stepIdx,
  isReview,
  ready,
  busy,
  onPrev,
  onSkip,
  onNext,
  onCommit,
  onClose
}: {
  stepIdx: number;
  isReview: boolean;
  ready: boolean;
  busy: boolean;
  onPrev: () => void;
  onSkip: () => void;
  onNext: () => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modalActions modalActionsWrap">
      <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
        取消
      </button>
      {stepIdx > 0 ? (
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={onPrev}>
          上一步
        </button>
      ) : null}
      {!isReview ? (
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={onSkip}>
          跳过本步
        </button>
      ) : null}
      {!isReview && stepIdx < STEPS.length - 1 ? (
        <button type="button" className="btnModalPrimary" disabled={busy} onClick={onNext}>
          下一步
        </button>
      ) : null}
      {isReview ? (
        <button type="button" className="btnModalPrimary" disabled={busy || !ready} onClick={onCommit}>
          创建书籍
        </button>
      ) : null}
    </div>
  );
}
