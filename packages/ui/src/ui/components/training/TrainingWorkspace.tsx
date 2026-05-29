import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateTrainingQuestions,
  getTrainingAttempt,
  getTrainingQuestion,
  getTrainingQuestionAttempts,
  getTrainingTree,
  listTrainingAttempts,
  submitTrainingQuestion,
  type TrainingAttempt,
  type TrainingGradingMode,
  type TrainingGradingResult,
  type TrainingQuestion,
  type TrainingScene,
  allTreeScenes,
  type TrainingTree
} from "../../api";
import { TrainingAttemptHistory } from "./TrainingAttemptHistory";
import { TrainingSceneTree, type TrainingSelection } from "./TrainingSceneTree";
import { TrainingGenerateMenu } from "./TrainingGenerateMenu";
import { TrainingLessonMarkdown } from "./TrainingLessonMarkdown";
import { TrainingGradingModePicker } from "./TrainingGradingModePicker";
import { TrainingGradingView } from "./TrainingGradingView";
import { resolveTrainingGradingMode } from "./gradingModeLabels";
import { TrainingRecordsPage } from "./TrainingRecordsPage";
import { TrainingSceneChat } from "./TrainingSceneChat";
import { TrainingWorkbenchSplit } from "./TrainingWorkbenchSplit";
import { TrainingTopBar } from "./TrainingTopBar";

type Screen = "practice" | "records";

function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const text = e.message.trim();
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* */
  }
  return text || "请求失败";
}

function sceneIdFromSelection(sel: TrainingSelection | null): string | null {
  if (!sel || sel.kind === "group") return null;
  return sel.sceneId;
}

export function TrainingWorkspace(props: {
  onExit: () => void;
  onStatus?: (msg: string) => void;
  modelConfigId?: string | null;
}) {
  const [screen, setScreen] = useState<Screen>("practice");
  const [tree, setTree] = useState<TrainingTree | null>(null);
  const [selection, setSelection] = useState<TrainingSelection | null>(null);
  const [question, setQuestion] = useState<TrainingQuestion | null>(null);
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [allAttempts, setAllAttempts] = useState<TrainingAttempt[]>([]);
  const [text, setText] = useState("");
  const [grading, setGrading] = useState<{
    question: TrainingQuestion;
    result: TrainingGradingResult;
    gradingMode: TrainingGradingMode;
    answerText: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<TrainingGradingMode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const scenes = useMemo(() => (tree ? allTreeScenes(tree) : []), [tree]);

  const sceneDetail = useMemo((): TrainingScene | null => {
    const sid = sceneIdFromSelection(selection);
    if (!sid) return null;
    const scene = scenes.find((s) => s.id === sid);
    if (!scene) return null;
    return {
      id: scene.id,
      title: scene.title,
      order: scene.order,
      teachingFile: scene.teachingFile,
      contentMarkdown: scene.contentMarkdown,
      rubricHints: scene.rubricHints,
      exerciseDefaults: scene.exerciseDefaults,
      sceneBrief: scene.sceneBrief ?? ""
    };
  }, [selection, scenes]);

  const questionId = selection?.kind === "question" ? selection.questionId : null;

  const refreshTree = useCallback(async () => {
    const data = await getTrainingTree();
    setTree(data);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await refreshTree();
        const technique = data.groups.find((g) => g.id === "group-technique");
        const group = technique ?? data.groups[0];
        const first = group?.scenes[0];
        if (first && group) {
          setSelection({ kind: "scene", groupId: group.id, sceneId: first.id });
        } else if (group) {
          setSelection({ kind: "group", groupId: group.id });
        }
      } catch (e: unknown) {
        setLoadError(formatApiError(e));
      }
    })();
  }, [refreshTree]);

  useEffect(() => {
    if (!questionId) {
      setQuestion(null);
      setAttempts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { question: q } = await getTrainingQuestion(questionId);
        const { attempts: list } = await getTrainingQuestionAttempts(questionId);
        if (!cancelled) {
          setQuestion(q);
          setAttempts(list);
        }
      } catch (e: unknown) {
        if (!cancelled) props.onStatus?.(formatApiError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId, props.onStatus]);

  async function handleGenerate(count: 1 | 3 | 5) {
    if (!selection || selection.kind !== "scene") {
      props.onStatus?.("请先选择一个场景或技法分类");
      return;
    }
    setBusy(true);
    try {
      const res = await generateTrainingQuestions(selection.sceneId, count);
      await refreshTree();
      if (res.questions[0]) {
        setSelection({
          kind: "question",
          groupId: selection.groupId,
          sceneId: selection.sceneId,
          questionId: res.questions[0]!.id
        });
      }
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitWithMode(mode: TrainingGradingMode) {
    if (!question) return;
    setSubmitError(null);
    setBusy(true);
    setSubmittingMode(mode);
    const answer = text.trim();
    try {
      const res = await submitTrainingQuestion(question.id, answer, mode);
      setGrading({
        question,
        result: res.result,
        gradingMode: res.attempt.gradingMode ?? mode,
        answerText: res.attempt.text ?? answer
      });
      try {
        localStorage.setItem("novel-helper.trainingGradingMode", mode);
      } catch {
        /* */
      }
      await refreshTree();
      const { attempts: list } = await getTrainingQuestionAttempts(question.id);
      setAttempts(list);
    } catch (e: unknown) {
      setSubmitError(formatApiError(e));
    } finally {
      setBusy(false);
      setSubmittingMode(null);
    }
  }

  async function openGradingForAttempt(attempt: TrainingAttempt) {
    setBusy(true);
    try {
      const q =
        question?.id === attempt.questionId
          ? question
          : (await getTrainingQuestion(attempt.questionId)).question;
      if (question?.id !== attempt.questionId) {
        setQuestion(q);
      }
      setGrading({
        question: q,
        result: attempt.result,
        gradingMode: resolveTrainingGradingMode(attempt.gradingMode),
        answerText: attempt.text
      });
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openRecords() {
    setBusy(true);
    try {
      const { attempts: list } = await listTrainingAttempts();
      setAllAttempts(list);
      setScreen("records");
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const charCount = text.length;
  const canSubmit =
    question &&
    !busy &&
    charCount >= question.minChars &&
    charCount <= Math.min(question.maxChars, 2000);

  const gradingModal = grading ? (
    <TrainingGradingView
      open
      question={grading.question}
      result={grading.result}
      gradingMode={grading.gradingMode}
      answerText={grading.answerText}
      onClose={() => setGrading(null)}
      onRetry={() => setGrading(null)}
      onViewHistory={() => {
        const groupId =
          tree?.groups.find((gr) => gr.scenes.some((s) => s.id === grading.question.sceneId))?.id ??
          "group-scene-practice";
        setSelection({
          kind: "question",
          groupId,
          sceneId: grading.question.sceneId,
          questionId: grading.question.id
        });
        setGrading(null);
        setScreen("practice");
      }}
    />
  ) : null;

  if (loadError) {
    return (
      <div className="trainingWorkspace">
        <TrainingTopBar onExit={props.onExit} />
        <div className="trainingBody">
          <p className="settingsDataDirFeedback settingsDataDirFeedbackErr">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="trainingWorkspace">
        <TrainingTopBar onExit={props.onExit} />
        <div className="trainingBody">
          <p className="muted">加载训练数据…</p>
        </div>
      </div>
    );
  }

  if (screen === "records") {
    return (
      <>
        <div className="trainingWorkspace">
          <TrainingTopBar onExit={props.onExit} />
          <div className="trainingBody trainingBodyWide">
            <TrainingRecordsPage
              tree={tree}
              attempts={allAttempts}
              onBack={() => setScreen("practice")}
              onOpenAttempt={(attemptId, questionId) => {
                void (async () => {
                  setBusy(true);
                  try {
                    const { attempt } = await getTrainingAttempt(attemptId);
                    const { question: q } = await getTrainingQuestion(questionId);
                    setGrading({
                      question: q,
                      result: attempt.result,
                      gradingMode: resolveTrainingGradingMode(attempt.gradingMode),
                      answerText: attempt.text
                    });
                    const g =
                      tree.groups.find((gr) => gr.scenes.some((s) => s.id === q.sceneId))?.id ??
                      "group-scene-practice";
                    setSelection({ kind: "question", groupId: g, sceneId: q.sceneId, questionId });
                  } catch (e: unknown) {
                    props.onStatus?.(formatApiError(e));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
          </div>
        </div>
        {gradingModal}
      </>
    );
  }

  return (
    <>
      <div className="trainingWorkspace">
        <TrainingTopBar onExit={props.onExit} onOpenHistory={() => void openRecords()} />
        <div className="trainingWorkbench">
          <aside className="trainingTreeNav">
            <TrainingSceneTree
              groups={tree.groups}
              selection={selection}
              disabled={busy}
              onSelect={setSelection}
            />
          </aside>
          <TrainingWorkbenchSplit
            mode={selection?.kind === "question" ? "practice" : "learn"}
            center={
              <div className="trainingMain">
                {selection?.kind === "scene" && sceneDetail ? (
                  <header className="trainingLearnHead">
                    <h3 className="trainingPaneTitle">学法</h3>
                    <TrainingGenerateMenu disabled={busy} busy={busy} onGenerate={(c) => void handleGenerate(c)} />
                  </header>
                ) : (
                  <h3 className="trainingPaneTitle">{selection?.kind === "question" ? "题目" : "学法"}</h3>
                )}
                {selection?.kind === "group" ? (
                  <p className="muted">请从左侧展开分组，选择一个场景或技法分类开始学习或出题。</p>
                ) : null}
                {selection?.kind === "scene" && sceneDetail ? (
                  <>
                    <h2 className="trainingLessonTitle">{sceneDetail.title}</h2>
                    <TrainingLessonMarkdown content={sceneDetail.contentMarkdown} />
                  </>
                ) : null}
                {selection?.kind === "question" && question ? (
                  <>
                    <h2 className="trainingLessonTitle">{question.title}</h2>
                    <p className="trainingExercisePrompt">{question.prompt}</p>
                    {question.snippet ? (
                      <div className="trainingSnippet">
                        <h4 className="trainingSnippetHeading">{question.snippet.title}</h4>
                        <pre className="trainingSnippetBody">{question.snippet.body}</pre>
                      </div>
                    ) : null}
                    <section className="trainingAttemptsSection">
                      <h4>历次练习</h4>
                      <TrainingAttemptHistory
                        attempts={attempts}
                        onOpenAttempt={(a) => void openGradingForAttempt(a)}
                      />
                    </section>
                  </>
                ) : selection?.kind === "scene" ? (
                  <p className="muted">阅读学法后可在右侧咨询；点击上方「生成题目」或从左侧选择题目开始练习。</p>
                ) : selection?.kind !== "group" ? (
                  <p className="muted">请从左侧选择场景。</p>
                ) : null}
              </div>
            }
            right={
              selection?.kind === "scene" && sceneDetail ? (
                <TrainingSceneChat
                  sceneId={sceneDetail.id}
                  sceneTitle={sceneDetail.title}
                  modelConfigId={props.modelConfigId ?? null}
                  disabled={busy}
                  onStatus={props.onStatus}
                />
              ) : (
                <aside className="trainingPractice">
                  <h3 className="trainingPaneTitle">练习</h3>
                  {!question ? (
                    <p className="muted">请选择一个题目后开始写作。</p>
                  ) : (
                    <>
                      <textarea
                        className="trainingTextarea trainingTextareaGrow"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={busy}
                        placeholder="在此输入练习…"
                      />
                      <footer className="trainingPracticeFooter">
                        <p className="muted trainingCharCount">
                          {charCount} 字（{question.minChars}–{question.maxChars}，上限 2000）
                        </p>
                        {submitError ? (
                          <p className="settingsDataDirFeedback settingsDataDirFeedbackErr">{submitError}</p>
                        ) : null}
                        <TrainingGradingModePicker
                          canSubmit={Boolean(canSubmit)}
                          disabled={busy}
                          busy={busy}
                          busyMode={submittingMode}
                          onSubmit={(mode) => void handleSubmitWithMode(mode)}
                        />
                      </footer>
                    </>
                  )}
                </aside>
              )
            }
          />
        </div>
      </div>
      {gradingModal}
    </>
  );
}
