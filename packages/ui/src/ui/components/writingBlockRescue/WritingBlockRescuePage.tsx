import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChapterMeta } from "../../api";
import { postWritingBlockRescue } from "../../api";
import { EntropyTarot } from "./EntropyTarot";
import type { EntropyCard, RescueLength, RescueResult, RescueRoute, RescueVariant } from "./types";
import { ROUTE_LABELS, VARIANT_LABELS } from "./types";

const ROUTES: RescueRoute[] = ["event", "emotion", "info"];
const VARIANTS: RescueVariant[] = ["A", "B", "C"];

type Props = {
  bookId: string;
  bookTitle: string;
  chapters: ChapterMeta[];
  chapterFilename: string | null;
  onSelectChapter: (c: ChapterMeta) => void;
  onGoWritingGuidanceWithPrompt: (prompt: string) => void;
  busy: boolean;
  onStatus: (msg: string) => void;
};

export function WritingBlockRescuePage({
  bookId,
  bookTitle,
  chapters,
  chapterFilename,
  onSelectChapter,
  onGoWritingGuidanceWithPrompt,
  busy,
  onStatus
}: Props) {
  const [length, setLength] = useState<RescueLength>("mid");
  const [moreChaos, setMoreChaos] = useState(false);
  const [blockNote, setBlockNote] = useState("");
  const [injectEntropy, setInjectEntropy] = useState(false);
  const [entropyCard, setEntropyCard] = useState<EntropyCard | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RescueResult | null>(null);
  const [contextMeta, setContextMeta] = useState<{ memoryChars: number; chapterChars: number } | null>(
    null
  );
  const [variantByRoute, setVariantByRoute] = useState<Record<RescueRoute, RescueVariant>>({
    event: "A",
    emotion: "A",
    info: "A"
  });

  const latestChapter = useMemo(() => {
    const scored = chapters
      .map((c) => ({ c, n: Number.parseInt(String(c.id || "").trim(), 10) }))
      .filter((x) => Number.isFinite(x.n));
    if (scored.length) return scored.sort((a, b) => b.n - a.n)[0].c;
    return chapters.length ? [...chapters].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] : null;
  }, [chapters]);

  useEffect(() => {
    if (!latestChapter) return;
    if (chapterFilename !== latestChapter.filename) onSelectChapter(latestChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestChapter?.filename]);

  type RescueSession = {
    id: string;
    createdAt: string;
    params: {
      length: RescueLength;
      moreChaos: boolean;
      injectEntropy: boolean;
      entropyCardId: string | null;
    };
    blockNote: string;
    result: RescueResult;
    variantByRoute: Record<RescueRoute, RescueVariant>;
  };

  const storageKey = `novel-helper-writing-block-rescue-sessions-${bookId}`;
  const [sessions, setSessions] = useState<RescueSession[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? (arr as RescueSession[]) : [];
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions.slice(0, 60)));
    } catch {
      // ignore
    }
  }, [sessions, storageKey]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  useEffect(() => {
    if (!activeSessionId && sessions.length) setActiveSessionId(sessions[0].id);
  }, [activeSessionId, sessions]);

  const generate = useCallback(async () => {
    if (!latestChapter?.filename) {
      setError("未找到最新章节");
      return;
    }
    setGenerating(true);
    setError("");
    onStatus("正在生成走向与决策信息…");
    try {
      const res = await postWritingBlockRescue({
        bookId,
        chapterFilename: latestChapter.filename,
        length,
        moreChaos,
        cursorHint: blockNote.trim() || undefined,
        entropyCardId: entropyCard?.id,
        injectEntropy: injectEntropy && Boolean(entropyCard)
      });
      setResult(res.result);
      setContextMeta(res.context ?? null);
      onStatus("卡文急救生成完成（仅走向/决策，不含正文）");

      const now = new Date();
      const session: RescueSession = {
        id: `${now.getTime()}`,
        createdAt: now.toISOString(),
        params: {
          length,
          moreChaos,
          injectEntropy: injectEntropy && Boolean(entropyCard),
          entropyCardId: entropyCard?.id ?? null
        },
        blockNote: blockNote.trim(),
        result: res.result,
        variantByRoute
      };
      setSessions((prev) => [session, ...prev].slice(0, 60));
      setActiveSessionId(session.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onStatus(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    bookId,
    latestChapter?.filename,
    length,
    moreChaos,
    blockNote,
    entropyCard,
    injectEntropy,
    onStatus
  ]);

  const disabled = busy || generating;

  const viewResult = activeSession?.result ?? result;
  const viewVariantByRoute = activeSession?.variantByRoute ?? variantByRoute;

  return (
    <div className="writingBlockRescueWorkbench">
      <aside className="writingBlockRescueSessions" aria-label="卡文急救记录">
        <div className="writingBlockRescueSessionsHead">
          <div className="writingBlockRescueSessionsTitle">卡文记录</div>
          <button type="button" className="primary" disabled={disabled || !latestChapter} onClick={() => void generate()}>
            {generating ? "生成中…" : "新建一次急救"}
          </button>
        </div>
        <div className="muted writingBlockRescueSessionsMeta">
          仅针对最新章节：{latestChapter ? `${latestChapter.id} ${latestChapter.title}` : "（无）"}
        </div>
        <div className="writingBlockRescueSessionsList">
          {sessions.length ? (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`writingBlockRescueSessionRow ${activeSessionId === s.id ? "active" : ""}`}
                onClick={() => setActiveSessionId(s.id)}
              >
                <div className="writingBlockRescueSessionRowTitle">
                  {new Date(s.createdAt).toLocaleString()}
                </div>
                <div className="muted writingBlockRescueSessionRowMeta">
                  {s.params.length} · B混沌:{s.params.moreChaos ? "开" : "关"} · 抽卡:{s.params.injectEntropy ? s.params.entropyCardId ?? "开" : "关"}
                </div>
                {s.blockNote ? <div className="muted writingBlockRescueSessionRowNote">{s.blockNote}</div> : null}
              </button>
            ))
          ) : (
            <div className="muted writingBlockRescueEmpty">还没有记录。点击「新建一次急救」。</div>
          )}
        </div>
      </aside>

      <section className="writingBlockRescueInfo" aria-label="卡文信息">
        <div className="writingBlockRescueInfoHead">
          <div className="writingBlockRescueTitle">卡文急救</div>
          <div className="muted writingBlockRescueSubtitle">只输出走向/决策信息（禁止正文）</div>
        </div>
        <div className="writingBlockRescueControls">
          <label className="writingBlockRescueField">
            <span className="muted">长度</span>
            <select value={length} disabled={disabled} onChange={(e) => setLength(e.target.value as RescueLength)}>
              <option value="short">短</option>
              <option value="mid">中</option>
              <option value="long">长</option>
            </select>
          </label>
          <label className="writingBlockRescueCheck">
            <input type="checkbox" checked={moreChaos} disabled={disabled} onChange={(e) => setMoreChaos(e.target.checked)} />
            更混沌（B 型）
          </label>
        </div>

        <label className="writingBlockRescueHintField">
          <span className="muted">卡点描述（作者输入）</span>
          <textarea
            value={blockNote}
            disabled={disabled}
            placeholder="用要点描述：你卡在什么因果/张力/信息点上？（禁止粘贴正文）"
            onChange={(e) => setBlockNote(e.target.value)}
            rows={6}
          />
        </label>

        <EntropyTarot
          disabled={disabled}
          injectEntropy={injectEntropy}
          onInjectEntropyChange={setInjectEntropy}
          currentCardId={entropyCard?.id ?? null}
          onCurrentCardChange={setEntropyCard}
        />

        {contextMeta ? (
          <div className="muted writingBlockRescueContextMeta">
            上下文：记忆约 {contextMeta.memoryChars} 字 · 最新章约 {contextMeta.chapterChars} 字
          </div>
        ) : null}
        {error ? <div className="writingBlockRescueError">{error}</div> : null}
      </section>

      <section className="writingBlockRescueResults" aria-label="走向方案">
        {!viewResult ? (
          <div className="muted writingBlockRescueEmpty">选择左侧一条记录，或先新建一次急救。</div>
        ) : (
          <div className="writingBlockRescueCards">
            {ROUTES.map((route) => {
              const variant = viewVariantByRoute[route];
              const item = viewResult[route][variant];
              return (
                <article key={route} className="rescueCard">
                  <div className="rescueCardHead">
                    <h3>{ROUTE_LABELS[route]}</h3>
                    <div className="rescueVariantTabs" role="tablist">
                      {VARIANTS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="tab"
                          className={variant === v ? "active" : ""}
                          aria-selected={variant === v}
                          onClick={() => {
                            if (!activeSession) {
                              setVariantByRoute((prev) => ({ ...prev, [route]: v }));
                              return;
                            }
                            setSessions((prev) =>
                              prev.map((s) => (s.id === activeSession.id ? { ...s, variantByRoute: { ...s.variantByRoute, [route]: v } } : s))
                            );
                          }}
                        >
                          {v} {VARIANT_LABELS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rescueCardBody">
                    <div className="rescueField">
                      <div className="rescueFieldLabel muted">一句话路线</div>
                      <div>{item.oneLinePlan}</div>
                    </div>
                    <div className="rescueField">
                      <div className="rescueFieldLabel muted">读者爽点</div>
                      <div>{item.readerHook}</div>
                    </div>
                    {item.risk ? (
                      <div className="rescueField">
                        <div className="rescueFieldLabel muted">风险 / 收束</div>
                        <div>{item.risk}</div>
                      </div>
                    ) : null}

                    <div className="rescueField">
                      <div className="rescueFieldLabel muted">节拍清单</div>
                      <ul className="rescueBeats">
                        {item.beats.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rescueField">
                      <div className="rescueFieldLabel muted">场景卡片</div>
                      <div className="rescueSceneCard">
                        <div><span className="muted">目标：</span>{item.sceneCard.goal}</div>
                        <div><span className="muted">阻力：</span>{item.sceneCard.conflict}</div>
                        <div><span className="muted">转折：</span>{item.sceneCard.turningPoint}</div>
                        {item.sceneCard.cost ? <div><span className="muted">代价：</span>{item.sceneCard.cost}</div> : null}
                        {item.sceneCard.reveal ? <div><span className="muted">揭示：</span>{item.sceneCard.reveal}</div> : null}
                        <div><span className="muted">钩子：</span>{item.sceneCard.hook}</div>
                      </div>
                    </div>

                    {item.decisions?.length ? (
                      <div className="rescueField">
                        <div className="rescueFieldLabel muted">决策点</div>
                        <div className="rescueDecisions">
                          {item.decisions.slice(0, 3).map((d, i) => (
                            <div key={i} className="rescueDecision">
                              <div><span className="muted">选择：</span>{d.choice}</div>
                              <div><span className="muted">后果：</span>{d.consequence}</div>
                              {d.risk ? <div><span className="muted">风险：</span>{d.risk}</div> : null}
                              {d.whenToUse ? <div><span className="muted">适用：</span>{d.whenToUse}</div> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.citations?.length ? (
                      <div className="rescueField">
                        <div className="rescueFieldLabel muted">记忆锚点</div>
                        <div className="rescueCitations">{item.citations.join(" · ")}</div>
                      </div>
                    ) : null}

                    <div className="rescueCardActions">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          const prompt = [
                            `【卡文急救·走向/决策】`,
                            `路线：${ROUTE_LABELS[route]} / 类型：${VARIANT_LABELS[variant]}`,
                            "",
                            `一句话路线：${item.oneLinePlan}`,
                            `爽点：${item.readerHook}`,
                            item.risk ? `风险：${item.risk}` : "",
                            "",
                            "节拍：",
                            ...item.beats.map((x) => `- ${x}`),
                            "",
                            "场景卡片：",
                            `- 目标：${item.sceneCard.goal}`,
                            `- 阻力：${item.sceneCard.conflict}`,
                            `- 转折：${item.sceneCard.turningPoint}`,
                            item.sceneCard.cost ? `- 代价：${item.sceneCard.cost}` : "",
                            item.sceneCard.reveal ? `- 揭示：${item.sceneCard.reveal}` : "",
                            `- 钩子：${item.sceneCard.hook}`,
                            "",
                            item.decisions?.length
                              ? ["决策点：", ...item.decisions.slice(0, 3).flatMap((d) => [`- 选择：${d.choice}`, `  后果：${d.consequence}`, d.risk ? `  风险：${d.risk}` : "", d.whenToUse ? `  适用：${d.whenToUse}` : ""]).filter(Boolean)]
                              : [],
                            "",
                            "请围绕这些走向与决策，和我讨论下一章怎么推进；禁止输出正文段落/对白。"
                          ]
                            .flat()
                            .filter(Boolean)
                            .join("\n");
                          onGoWritingGuidanceWithPrompt(prompt);
                        }}
                      >
                        复制决策提示 → 写作指导讨论
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
