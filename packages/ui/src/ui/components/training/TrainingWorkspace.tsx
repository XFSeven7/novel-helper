import React, { useCallback, useEffect, useState } from "react";
import {
  generateTrainingQuestions,
  getTrainingAttempt,
  getTrainingQuestion,
  getTrainingQuestionAttempts,
  getTrainingTree,
  listTrainingAttempts,
  submitTrainingQuestion,
  type TrainingAttempt,
  type TrainingCategory,
  type TrainingGradingResult,
  type TrainingQuestion,
  type TrainingTreeCategory
} from "../../api";
import { TrainingAttemptHistory } from "./TrainingAttemptHistory";
import { TrainingCategoryTree, type TrainingSelection } from "./TrainingCategoryTree";
import { TrainingGenerateMenu } from "./TrainingGenerateMenu";
import { TrainingGradingView } from "./TrainingGradingView";
import { TrainingRecordsPage } from "./TrainingRecordsPage";
import { TrainingCategoryChat } from "./TrainingCategoryChat";
import { TrainingWorkbenchSplit } from "./TrainingWorkbenchSplit";
import { TrainingTopBar } from "./TrainingTopBar";

type Screen = "practice" | "grading" | "records";

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

export function TrainingWorkspace(props: {
  onExit: () => void;
  onStatus?: (msg: string) => void;
  modelConfigId?: string | null;
}) {
  const [screen, setScreen] = useState<Screen>("practice");
  const [categories, setCategories] = useState<TrainingTreeCategory[]>([]);
  const [selection, setSelection] = useState<TrainingSelection | null>(null);
  const [categoryDetail, setCategoryDetail] = useState<TrainingCategory | null>(null);
  const [question, setQuestion] = useState<TrainingQuestion | null>(null);
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [allAttempts, setAllAttempts] = useState<TrainingAttempt[]>([]);
  const [text, setText] = useState("");
  const [grading, setGrading] = useState<{ question: TrainingQuestion; result: TrainingGradingResult } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    const data = await getTrainingTree();
    setCategories(data.categories);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshTree();
        const first = (await getTrainingTree()).categories[0];
        if (first) setSelection({ kind: "category", categoryId: first.id });
      } catch (e: unknown) {
        setLoadError(formatApiError(e));
      }
    })();
  }, [refreshTree]);

  useEffect(() => {
    if (!selection) {
      setCategoryDetail(null);
      setQuestion(null);
      return;
    }
    const cat = categories.find((c) => c.id === selection.categoryId);
    if (cat) {
      setCategoryDetail({
        id: cat.id,
        title: cat.title,
        order: cat.order,
        contentMarkdown: cat.contentMarkdown,
        rubricHints: cat.rubricHints,
        exerciseDefaults: cat.exerciseDefaults
      });
    }
    if (selection.kind === "question") {
      void (async () => {
        try {
          const { question: q } = await getTrainingQuestion(selection.questionId);
          setQuestion(q);
          const { attempts: list } = await getTrainingQuestionAttempts(selection.questionId);
          setAttempts(list);
        } catch (e: unknown) {
          props.onStatus?.(formatApiError(e));
        }
      })();
    } else {
      setQuestion(null);
      setAttempts([]);
    }
  }, [selection, categories, props]);

  async function handleGenerate(count: 1 | 3 | 5) {
    if (!selection || selection.kind !== "category") {
      props.onStatus?.("请先选择一个题型分类");
      return;
    }
    setBusy(true);
    try {
      const res = await generateTrainingQuestions(selection.categoryId, count);
      await refreshTree();
      if (res.questions[0]) {
        setSelection({
          kind: "question",
          categoryId: selection.categoryId,
          questionId: res.questions[0]!.id
        });
      }
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!question) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const res = await submitTrainingQuestion(question.id, text.trim());
      setGrading({ question, result: res.result });
      setScreen("grading");
      await refreshTree();
      const { attempts: list } = await getTrainingQuestionAttempts(question.id);
      setAttempts(list);
    } catch (e: unknown) {
      setSubmitError(formatApiError(e));
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

  if (screen === "records") {
    return (
      <div className="trainingWorkspace">
        <TrainingTopBar onExit={props.onExit} />
        <div className="trainingBody trainingBodyWide">
          <TrainingRecordsPage
            categories={categories}
            attempts={allAttempts}
            onBack={() => setScreen("practice")}
            onOpenAttempt={(attemptId, questionId) => {
              void (async () => {
                setBusy(true);
                try {
                  const { attempt } = await getTrainingAttempt(attemptId);
                  const { question: q } = await getTrainingQuestion(questionId);
                  setGrading({ question: q, result: attempt.result });
                  setSelection({ kind: "question", categoryId: q.categoryId, questionId });
                  setScreen("grading");
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
    );
  }

  if (screen === "grading" && grading) {
    return (
      <div className="trainingWorkspace">
        <TrainingTopBar onExit={props.onExit} onOpenHistory={() => void openRecords()} />
        <div className="trainingBody trainingBodyWide">
          <TrainingGradingView
            question={grading.question}
            result={grading.result}
            onBackToTree={() => {
              setGrading(null);
              setScreen("practice");
            }}
            onRetry={() => {
              setGrading(null);
              setScreen("practice");
            }}
            onViewHistory={() => {
              setSelection({
                kind: "question",
                categoryId: grading.question.categoryId,
                questionId: grading.question.id
              });
              setGrading(null);
              setScreen("practice");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="trainingWorkspace">
      <TrainingTopBar onExit={props.onExit} onOpenHistory={() => void openRecords()} />
      <div className="trainingWorkbench">
        <aside className="trainingTreeNav">
          <TrainingCategoryTree
            categories={categories}
            selection={selection}
            disabled={busy}
            onSelect={setSelection}
          />
        </aside>
        <TrainingWorkbenchSplit
          mode={selection?.kind === "question" ? "practice" : "learn"}
          center={
            <div className="trainingMain">
              {selection?.kind === "category" && categoryDetail ? (
                <header className="trainingLearnHead">
                  <h3 className="trainingPaneTitle">学法</h3>
                  <TrainingGenerateMenu disabled={busy} busy={busy} onGenerate={(c) => void handleGenerate(c)} />
                </header>
              ) : (
                <h3 className="trainingPaneTitle">{selection?.kind === "question" ? "题目" : "学法"}</h3>
              )}
              {selection?.kind === "category" && categoryDetail ? (
                <>
                  <h2 className="trainingLessonTitle">{categoryDetail.title}</h2>
                  <div className="trainingLessonContent">{categoryDetail.contentMarkdown}</div>
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
                    <TrainingAttemptHistory attempts={attempts} />
                  </section>
                </>
              ) : selection?.kind === "category" ? (
                <p className="muted">阅读学法后可在右侧咨询；点击上方「生成题目」或从左侧选择题目开始练习。</p>
              ) : (
                <p className="muted">请从左侧选择题型。</p>
              )}
            </div>
          }
          right={
            selection?.kind === "category" && categoryDetail ? (
              <TrainingCategoryChat
                categoryId={categoryDetail.id}
                categoryTitle={categoryDetail.title}
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
                      <button
                        type="button"
                        className="btnModalPrimary"
                        disabled={!canSubmit}
                        onClick={() => void handleSubmit()}
                      >
                        {busy ? "评改中…" : "提交评改"}
                      </button>
                    </footer>
                  </>
                )}
              </aside>
            )
          }
        />
      </div>
    </div>
  );
}
