import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WritingPack } from "../../api";
import type { ChapterSelected } from "../editor/ChapterEditorContent";

export type RightTabId = "chapterAnalysis" | "chapterEntities" | "writingPack";

export type RightPanelProps = {
  busy: boolean;
  activeBook: string;
  selectedChapter: ChapterSelected;
  rightTab: RightTabId;
  setRightTab: React.Dispatch<React.SetStateAction<RightTabId>>;
  okModelConfigs: Array<{ id: string; model?: string; lastTestOk?: boolean }>;
  activeModelId: string | null;
  activeModelLabel: string;
  auditModelPickerOpen: boolean;
  setAuditModelPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  auditModelSearch: string;
  setAuditModelSearch: React.Dispatch<React.SetStateAction<string>>;
  okModelGroupsFiltered: any[];
  setModelState: React.Dispatch<React.SetStateAction<any>>;
  onGoModelConfigList: () => void;
  writingPack: WritingPack | null;
  writingPackBusy: boolean;
  writingPackErr: string;
  writingPackListsOpen: boolean;
  setWritingPackListsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onGenerateWritingPack: (slug: string, chapterFilename: string) => void | Promise<void>;
  setStatus: (msg: string) => void;
  auditDirty: boolean;
  auditDirtyDelta: { abs: number; ratio: number } | null;
  auditBusy: boolean;
  auditRun: any;
  onAuditSelectedChapter: () => void | Promise<void>;
  auditStreamPhase: "idle" | "running" | "done" | "error";
  auditStreamText: string;
  auditStreamRef: React.RefObject<HTMLDivElement | null>;
  auditRunningChapter: { bookSlug: string; filename: string } | null;
  auditProgress: { step: number; total: number; label: string } | null;
  onJumpToRunningAuditChapter: () => void | Promise<void>;
  onJumpToOrganize: (
    tab: "chapterAnalysis" | "chapterEntities" | "auditCharacters" | "places" | "timeline" | "foreshadows" | "story" | "orgs",
    key: string
  ) => void;
};

export function RightPanel({
  busy,
  activeBook,
  selectedChapter,
  rightTab,
  setRightTab,
  okModelConfigs,
  activeModelId,
  activeModelLabel,
  auditModelPickerOpen,
  setAuditModelPickerOpen,
  auditModelSearch,
  setAuditModelSearch,
  okModelGroupsFiltered,
  setModelState,
  onGoModelConfigList,
  writingPack,
  writingPackBusy,
  writingPackErr,
  writingPackListsOpen,
  setWritingPackListsOpen,
  onGenerateWritingPack,
  setStatus,
  auditDirty,
  auditDirtyDelta,
  auditBusy,
  auditRun,
  onAuditSelectedChapter,
  auditStreamPhase,
  auditStreamText,
  auditStreamRef,
  auditRunningChapter,
  auditProgress,
  onJumpToRunningAuditChapter,
  onJumpToOrganize
}: RightPanelProps) {
  return (
    <aside className="right">
      <section className="panel">
    <div className="contentOrganizeHeader">
      <div className="panelTitle contentOrganizeTitle">内容整理</div>
      <div className="auditModelPicker auditModelPickerHeader">
        <button
          type="button"
          className="auditModelBtn"
          disabled={busy || okModelConfigs.length === 0}
          onClick={() => setAuditModelPickerOpen((v) => !v)}
          title={
            okModelConfigs.length === 0
              ? "暂无连接成功的模型,请先在「设置」中配置模型并测试连接"
              : "选择具体模型(仅显示连接成功的)"
          }
        >
          <span className="auditModelBtnText">{activeModelLabel}</span>
          <span className="auditModelBtnCaret">▾</span>
        </button>

        {auditModelPickerOpen ? (
          <div className="auditModelPopover" role="listbox" aria-label="选择模型">
            <input
              className="auditModelSearch"
              placeholder="搜索模型..."
              value={auditModelSearch}
              onChange={(e) => setAuditModelSearch(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <div className="auditModelList">
              {okModelGroupsFiltered.length ? (
                okModelGroupsFiltered.map((g) => (
                  <div key={g.id} className="auditModelGroup">
                    <div className="auditModelGroupTitle">{g.label}</div>
                    {g.items.map((it: any) => {
                      const text = it.label;
                      const checked =
                        it.configId === activeModelId &&
                        (it.kind !== "ollamaModel" ||
                          text === (okModelConfigs.find((x) => x.id === activeModelId)?.model ?? "").trim());
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={`auditModelItem ${checked ? "active" : ""}`}
                          role="option"
                          aria-selected={checked}
                          onClick={() => {
                            setModelState((prev: any) => ({
                              ...prev,
                              activeId: it.configId,
                              configs:
                                it.kind === "ollamaModel"
                                  ? prev.configs.map((c: any) =>
                                      c.id === it.configId ? { ...c, model: it.modelName } : c
                                    )
                                  : prev.configs
                            }));
                            setAuditModelPickerOpen(false);
                            setAuditModelSearch("");
                          }}
                          disabled={busy}
                        >
                          <span className="auditModelItemText">{text}</span>
                          {checked ? <span className="auditModelItemCheck">✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="auditModelEmpty muted">没有匹配的模型。</div>
              )}
            </div>
            <button type="button" className="auditModelManage" onClick={() => void onGoModelConfigList()}>
              设置
            </button>
          </div>
        ) : null}
      </div>
    </div>

    {!activeBook ? (
      <div className="rightNeedBook muted">请选择一本书</div>
    ) : (
      <>
        <div className="browserTabsBar" role="tablist" aria-label="内容整理页签">
          <div className="browserTabsStrip">
            <button
              type="button"
              role="tab"
              className={`browserTab ${rightTab === "writingPack" ? "active" : ""}`}
              aria-selected={rightTab === "writingPack"}
              onClick={() => setRightTab("writingPack")}
              disabled={busy}
            >
              写作包
            </button>
            <button
              type="button"
              role="tab"
              className={`browserTab ${rightTab === "chapterAnalysis" ? "active" : ""}`}
              aria-selected={rightTab === "chapterAnalysis"}
              onClick={() => setRightTab("chapterAnalysis")}
              disabled={busy}
            >
              本章分析
            </button>
            <button
              type="button"
              role="tab"
              className={`browserTab ${rightTab === "chapterEntities" ? "active" : ""}`}
              aria-selected={rightTab === "chapterEntities"}
              onClick={() => setRightTab("chapterEntities")}
              disabled={busy}
            >
              本章实体
            </button>
          </div>
        </div>

        <div className="organizeTabScroll">
          {rightTab === "writingPack" ? (
            <div className="auditPanel writingPackPanel">
              <div className="auditPanelBody">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="auditPanelTitle">写作参考</div>
                  {activeBook && selectedChapter ? (
                    <button
                      type="button"
                      className="btnSquare"
                      disabled={busy || writingPackBusy}
                      onClick={() => void onGenerateWritingPack(activeBook, selectedChapter.filename)}
                      title="重新生成并覆盖保存的写作包"
                    >
                      {writingPackBusy ? "生成中..." : "重新生成"}
                    </button>
                  ) : null}
                </div>

                {!selectedChapter ? (
                  <div className="muted auditPanelEmpty">请选择章节。</div>
                ) : writingPackErr ? (
                  <div className="auditErrorBox">
                    <div className="auditErrorTitle">写作包生成失败</div>
                    <div className="auditErrorMsg">{writingPackErr}</div>
                  </div>
                ) : writingPack && Array.isArray(writingPack.summary5) ? (
                  <>
                    <div className="writingPackSummary">
                      {writingPack.summary5.slice(0, 5).map((s, i) => (
                        <div key={i} className="writingPackLine">
                          {String(s || "").trim()}
                        </div>
                      ))}
                    </div>

                    <div className="writingPackDisclaimer muted">
                      {String(writingPack.disclaimer || "").trim() ||
                        "写作包仅供参考:你完全可以不采纳,按自己的创作思路推进。"}
                    </div>

                    <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
                      <button
                        type="button"
                        className="btnSquare"
                        disabled={busy}
                        onClick={() => {
                          try {
                            const text = writingPack.summary5
                              .slice(0, 5)
                              .map((x) => String(x || "").trim())
                              .filter(Boolean)
                              .join("\n");
                            void navigator.clipboard.writeText(text);
                            setStatus("已复制写作包总述到剪贴板。");
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        复制总述
                      </button>
                      <button
                        type="button"
                        className="btnSquare"
                        disabled={busy}
                        onClick={() => setWritingPackListsOpen((v) => !v)}
                      >
                        {writingPackListsOpen ? "收起清单" : "展开清单"}
                      </button>
                    </div>

                    {writingPackListsOpen ? (
                      <div className="writingPackLists">
                        <div className="writingPackListBlock">
                          <div className="writingPackListTitle">可能相关的进行中</div>
                          {(writingPack.lists?.progress || []).length ? (
                            <div className="writingPackList">
                              {(writingPack.lists.progress || []).slice(0, 4).map((it) => (
                                <div key={it.id} className="writingPackItem">
                                  <div className="writingPackItemMain">{it.title}</div>
                                  {it.basis ? <div className="muted writingPackItemBasis">{it.basis}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="muted">(暂无)</div>
                          )}
                        </div>

                        <div className="writingPackListBlock">
                          <div className="writingPackListTitle">可能触及的伏笔</div>
                          {(writingPack.lists?.foreshadows || []).length ? (
                            <div className="writingPackList">
                              {(writingPack.lists.foreshadows || []).slice(0, 2).map((it) => (
                                <div key={it.id} className="writingPackItem">
                                  <div className="writingPackItemMain">{it.title}</div>
                                  {it.basis ? <div className="muted writingPackItemBasis">{it.basis}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="muted">(暂无)</div>
                          )}
                        </div>

                        <div className="writingPackListBlock">
                          <div className="writingPackListTitle">风险预警</div>
                          {(writingPack.lists?.risks || []).length ? (
                            <div className="writingPackList">
                              {(writingPack.lists.risks || []).slice(0, 3).map((it, idx) => (
                                <div key={idx} className="writingPackItem">
                                  <div className="writingPackItemMain">{it.issue}</div>
                                  {it.basis ? <div className="muted writingPackItemBasis">{it.basis}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="muted">(暂无)</div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="muted auditPanelEmpty">
                    暂无写作包。你可以点击右上角"重新生成"来生成一份(会保存到本地)。{writingPackBusy ? "(生成中...)" : ""}
                  </div>
                )}
              </div>
            </div>
          ) : rightTab === "chapterAnalysis" ? (
            <div className="auditPanel">
              <div className="auditPanelBody">
                {auditDirty ? (
                  <div className="auditDirtyBar" role="status" aria-label="分析可能过期提示">
                    <div className="auditDirtyText">
                      正文已修改,分析可能过期
                      {auditDirtyDelta ? (
                        <span className="auditDirtyMeta muted">
                          (约 {auditDirtyDelta.abs} 字变动 · {(auditDirtyDelta.ratio * 100).toFixed(0)}%)
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btnSquare"
                      disabled={busy || auditBusy || !okModelConfigs.length}
                      onClick={() => void onAuditSelectedChapter()}
                      title={!okModelConfigs.length ? "请先在「设置」中配置模型并测试连接" : "重新分析本章以同步内容整理"}
                    >
                      重新分析
                    </button>
                  </div>
                ) : null}
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="auditPanelTitle">
                    {auditRunningChapter &&
                    activeBook &&
                    selectedChapter &&
                    auditRunningChapter.bookSlug === activeBook &&
                    auditRunningChapter.filename !== selectedChapter.filename &&
                    auditStreamPhase === "running"
                      ? "本章分析"
                      : auditStreamPhase === "running"
                      ? "分析中"
                      : auditStreamPhase === "error"
                        ? "分析失败"
                        : auditStreamText.trim()
                          ? "分析完成"
                          : "本章分析"}
                    {auditStreamPhase === "running" && auditProgress ? (
                      <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                        {auditProgress.step}/{auditProgress.total} · {auditProgress.label}
                      </span>
                    ) : null}
                  </div>
                  {auditStreamPhase !== "running" && auditStreamText.trim() ? (
                    <button
                      type="button"
                      className="btnSort"
                      onClick={() => void onAuditSelectedChapter()}
                      disabled={
                        busy ||
                        auditBusy ||
                        !selectedChapter ||
                        !okModelConfigs.length ||
                        !!(auditRunningChapter &&
                          !!activeBook &&
                          !!selectedChapter &&
                          auditRunningChapter.bookSlug === activeBook &&
                          auditRunningChapter.filename !== selectedChapter.filename)
                      }
                      title={!okModelConfigs.length ? "请先在「设置」中配置模型并测试连接" : "重新调用模型分析本章"}
                    >
                      重新分析
                    </button>
                  ) : null}
                </div>

                {auditRun ? (
                  <div style={{ marginTop: 10 }}>
                    {typeof auditRun?.gistL1 === "string" && auditRun.gistL1.trim() ? (
                      <div className="auditGist">{auditRun.gistL1}</div>
                    ) : null}

                    {(() => {
                      const s: any = (auditRun as any)?.scores;
                      const rows: Array<{ k: string; label: string; score: any; comment: any }> = [
                        { k: "literary_style", label: "文笔表现", score: s?.literary_style?.score, comment: s?.literary_style?.comment },
                        { k: "narrative_tension", label: "叙事张力", score: s?.narrative_tension?.score, comment: s?.narrative_tension?.comment },
                        { k: "logic_consistency", label: "逻辑严密", score: s?.logic_consistency?.score, comment: s?.logic_consistency?.comment },
                        { k: "character_vitality", label: "角色生命力", score: s?.character_vitality?.score, comment: s?.character_vitality?.comment },
                        { k: "hook_intensity", label: "期待感构建", score: s?.hook_intensity?.score, comment: s?.hook_intensity?.comment }
                      ].filter((r) => Number.isFinite(Number(r.score)) || String(r.comment || "").trim());
                      if (!rows.length) return null;
                      return (
                        <div className="auditChecks">
                          <div className="auditPanelTitle">评分</div>
                          {rows.map((r) => (
                            <div key={r.k} className="auditCheckItem">
                              <div className="auditCheckIssue">
                                {r.label}
                                {Number.isFinite(Number(r.score)) ? <span className="muted">({Number(r.score)})</span> : null}
                              </div>
                              {String(r.comment || "").trim() ? <div className="muted auditCheckSug">{String(r.comment || "").trim()}</div> : null}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {Array.isArray(auditRun?.impactAnalysis) && auditRun.impactAnalysis.length ? (
                      <div className="auditImpacts">
                        {(auditRun.impactAnalysis as any[]).slice(0, 12).map((it, idx) => (
                          <div key={idx} className="auditImpactItem">
                            <div className="auditImpactTop">
                              <span className="auditImpactScore">{it?.impactScore ?? 0}</span>
                              <span className="auditImpactText">{it?.item ?? ""}</span>
                            </div>
                            {it?.why ? <div className="muted auditImpactWhy">{it.why}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(auditRun?.consistencyChecks) && auditRun.consistencyChecks.length ? (
                      <div className="auditChecks">
                        <div className="auditPanelTitle">一致性问题</div>
                        {(auditRun.consistencyChecks as any[]).slice(0, 12).map((c, idx) => (
                          <div key={idx} className="auditCheckItem">
                            <div className="auditCheckIssue">{c?.issue ?? ""}</div>
                            {c?.suggestion ? <div className="muted auditCheckSug">{c.suggestion}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {auditRunningChapter &&
                activeBook &&
                selectedChapter &&
                auditRunningChapter.bookSlug === activeBook &&
                auditRunningChapter.filename !== selectedChapter.filename &&
                auditStreamPhase === "running" ? (
                  <div className="muted" style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    <button
                      type="button"
                      className="btnLink"
                      onClick={() => void onJumpToRunningAuditChapter()}
                      disabled={busy}
                    >
                      当前正在分析「{auditRunningChapter.filename}」,点击跳转回该章节查看进度
                    </button>
                  </div>
                ) : null}
                <div ref={auditStreamRef} className="auditStream">
                  {auditStreamText.trim() ? (
                    <div className="auditStreamInner auditStreamMd">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{auditStreamText}</ReactMarkdown>
                    </div>
                  ) : auditBusy &&
                    auditRunningChapter &&
                    activeBook &&
                    selectedChapter &&
                    auditRunningChapter.bookSlug === activeBook &&
                    auditRunningChapter.filename === selectedChapter.filename &&
                    auditStreamPhase === "running" ? (
                    <div className="auditStreamInner muted">
                      {auditProgress ? (
                        <>
                          正在执行 {auditProgress.step}/{auditProgress.total}:{auditProgress.label}
                        </>
                      ) : (
                        "正在执行中..."
                      )}
                    </div>
                  ) : auditRunningChapter &&
                    activeBook &&
                    selectedChapter &&
                    auditRunningChapter.bookSlug === activeBook &&
                    auditRunningChapter.filename !== selectedChapter.filename &&
                    auditStreamPhase === "running" ? (
                    <div className="auditStreamInner muted">
                      当前正在分析「{auditRunningChapter.filename}」。本章暂无分析内容。
                    </div>
                  ) : (
                    <div className="auditStreamEmpty">
                      <button
                        type="button"
                        className="btnAuditStartChapter"
                        disabled={
                          busy ||
                          auditBusy ||
                          !okModelConfigs.length ||
                          !!(auditRunningChapter &&
                            !!activeBook &&
                            !!selectedChapter &&
                            auditRunningChapter.bookSlug === activeBook &&
                            auditRunningChapter.filename !== selectedChapter.filename)
                        }
                        onClick={() => void onAuditSelectedChapter()}
                        title={
                          !okModelConfigs.length
                            ? "请先在「设置」中配置模型并测试连接,连接成功后再分析"
                            : auditRunningChapter &&
                                activeBook &&
                                selectedChapter &&
                                auditRunningChapter.bookSlug === activeBook &&
                                auditRunningChapter.filename !== selectedChapter.filename &&
                                auditStreamPhase === "running"
                              ? "当前有章节正在分析中,请先跳回查看进度"
                              : "调用当前模型分析本章(摘要与右侧内容整理将一并更新)"
                        }
                      >
                        开始分析
                      </button>
                      {!okModelConfigs.length ? (
                        <div className="muted auditStreamEmptyHint">暂无连接成功的模型,请先在「设置」中配置模型并测试连接。</div>
                      ) : (
                        <div className="muted auditStreamEmptyHint">使用右侧所选模型梳理本章要点。</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : rightTab === "chapterEntities" ? (
            <div className="chapterEntitiesPanel">
              {(() => {
                const chars = Array.isArray(auditRun?.entities?.characters) ? (auditRun.entities.characters as any[]) : [];
                const events = Array.isArray(auditRun?.entities?.events) ? (auditRun.entities.events as any[]) : [];
                const pickPlace = (ev: any) =>
                  String(
                    ev?.place ??
                      ev?.location ??
                      ev?.where ??
                      ev?.["地点"] ??
                      ev?.["发生地点"] ??
                      ""
                  ).trim();
                const pickOrg = (ev: any) =>
                  String(
                    ev?.org ??
                      ev?.organization ??
                      ev?.faction ??
                      ev?.["组织"] ??
                      ev?.["势力"] ??
                      ""
                  ).trim();
                const places = new Map<string, string>();
                const orgs = new Map<string, string>();
                for (const ev of events) {
                  const pn = pickPlace(ev);
                  const on = pickOrg(ev);
                  const note = String(ev?.summary || ev?.what || ev?.event || auditRun?.gistL1 || "").trim();
                  if (pn && !places.has(pn)) places.set(pn, note);
                  if (on && !orgs.has(on)) orgs.set(on, note);
                }
                return (
                  <>
                    {auditDirty ? (
                      <div className="auditDirtyBar" role="status" aria-label="分析可能过期提示">
                        <div className="auditDirtyText">
                          正文已修改,分析可能过期
                          {auditDirtyDelta ? (
                            <span className="auditDirtyMeta muted">
                              (约 {auditDirtyDelta.abs} 字变动 · {(auditDirtyDelta.ratio * 100).toFixed(0)}%)
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="btnSquare"
                          disabled={busy || auditBusy || !okModelConfigs.length}
                          onClick={() => void onAuditSelectedChapter()}
                          title={!okModelConfigs.length ? "请先在「设置」中配置模型并测试连接" : "重新分析本章以同步内容整理"}
                        >
                          重新分析
                        </button>
                      </div>
                    ) : null}
                    <div className="auditPanel">
                      <div className="auditPanelBody">
                        <div className="auditPanelTitle">本章角色</div>
                        {chars.length ? (
                          <div className="chapterEntityList">
                            {chars
                              .map((c) => ({
                                name: String(c?.name || "").trim(),
                                role: String(c?.role || "").trim()
                              }))
                              .filter((c) => c.name)
                              .slice(0, 80)
                              .map((c) => (
                                <button
                                  key={c.name}
                                  type="button"
                                  className="chapterEntityItem"
                                  disabled={busy}
                                  onClick={() => onJumpToOrganize("auditCharacters", c.name)}
                                  title="去左侧全局角色库查看"
                                >
                                  <span className="chapterEntityName">{c.name}</span>
                                  {c.role ? <span className="muted chapterEntityMeta">{c.role}</span> : null}
                                </button>
                              ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">本章未抽取到角色。</div>
                        )}
                      </div>
                    </div>

                    <div className="auditPanel">
                      <div className="auditPanelBody">
                        <div className="auditPanelTitle">本章地点</div>
                        {places.size ? (
                          <div className="chapterEntityList">
                            {[...places.entries()].slice(0, 80).map(([name, note]) => (
                              <button
                                key={name}
                                type="button"
                                className="chapterEntityItem"
                                disabled={busy}
                                onClick={() => onJumpToOrganize("places", name)}
                                title={note || "去左侧全局地点库查看"}
                              >
                                <span className="chapterEntityName">{name}</span>
                                {note ? <span className="muted chapterEntityMeta">{note}</span> : null}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">本章未识别到地点。</div>
                        )}
                      </div>
                    </div>

                    <div className="auditPanel">
                      <div className="auditPanelBody">
                        <div className="auditPanelTitle">本章组织</div>
                        {orgs.size ? (
                          <div className="chapterEntityList">
                            {[...orgs.entries()].slice(0, 80).map(([name, note]) => (
                              <div key={name} className="chapterEntityRow">
                                <div className="chapterEntityName">{name}</div>
                                {note ? <div className="muted chapterEntityMeta">{note}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">本章未识别到组织。</div>
                        )}
                      </div>
                    </div>

                    <div className="auditPanel">
                      <div className="auditPanelBody">
                        <div className="auditPanelTitle">本章事件</div>
                        {events.length ? (
                          <div className="chapterEventList">
                            {events.slice(0, 120).map((ev, i) => (
                              <div key={i} className="chapterEventItem">
                                <div className="chapterEventTop">
                                  <div className="chapterEventType">{String(ev?.type || "").trim() || "事件"}</div>
                                </div>
                                <div className="chapterEventSummary">
                                  {String(ev?.summary || ev?.what || ev?.event || "").trim() || "-"}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="muted auditPanelEmpty">本章未抽取到事件。</div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="empty">该页签后续完善。</div>
          )}
        </div>
      </>
    )}
  </section>
    </aside>
  );
}
