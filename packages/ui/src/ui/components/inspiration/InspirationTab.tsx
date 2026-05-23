import React from "react";
import type { IdeaItem, InspirationIndex } from "../../api";
import {
  generateInspirationPreview,
  purgeInspirationDeleted,
  setInspirationItemStatus,
  upsertInspirationItem
} from "../../api";
import {
  InspirationEventStructuredView,
  InspirationItemStructuredView,
  InspirationLoreStructuredView,
  InspirationOrgStructuredView,
  InspirationPlaceStructuredView,
  InspirationTechniqueStructuredView
} from "./InspirationStructuredViews";
import {
  type InspGenSlice,
  type InspTypeKey,
  inspirationEventCollapsedBlurb,
  inspirationItemCollapsedBlurb,
  inspirationLoreCollapsedBlurb,
  inspirationOrgCollapsedBlurb,
  inspirationPlaceCollapsedBlurb,
  inspirationTechniqueCollapsedBlurb,
  parseInspirationEventContent,
  parseInspirationItemContent,
  parseInspirationLoreContent,
  parseInspirationOrgContent,
  parseInspirationPlaceContent,
  parseInspirationTechniqueContent
} from "../../utils/inspirationParse";
import { clamp } from "../../utils/math";
import { appConfirm } from "../../dialog/dialog";

export type InspirationTabProps = {
  busy: boolean;
  activeBook: string;
  activeModelId: string | null;
  auditCharactersIndex: unknown;
  inspirationTypeTab: InspTypeKey;
  setInspirationTypeTab: React.Dispatch<React.SetStateAction<InspTypeKey>>;
  inspirationFuncByType: Record<InspTypeKey, "generate" | "list" | "recycle">;
  setInspirationFuncByType: React.Dispatch<
    React.SetStateAction<Record<InspTypeKey, "generate" | "list" | "recycle">>
  >;
  inspirationFuncTab: "generate" | "list" | "recycle";
  inspirationIndex: InspirationIndex | null;
  inspirationBusy: boolean;
  inspirationErr: string;
  inspirationFilter: "all" | "pinned";
  inspGenByType: Record<InspTypeKey, InspGenSlice>;
  setInspGenByType: React.Dispatch<React.SetStateAction<Record<InspTypeKey, InspGenSlice>>>;
  inspirationListExpanded: Record<string, boolean>;
  setInspirationListExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setInspirationBusy: (busy: boolean) => void;
  setInspirationErr: (err: string) => void;
  setInspirationIndex: (index: InspirationIndex | null) => void;
  setStatus: (msg: string) => void;
};

export function InspirationTab({
  busy,
  activeBook,
  activeModelId,
  auditCharactersIndex,
  inspirationTypeTab,
  setInspirationTypeTab,
  inspirationFuncByType,
  setInspirationFuncByType,
  inspirationFuncTab,
  inspirationIndex,
  inspirationBusy,
  inspirationErr,
  inspirationFilter,
  inspGenByType,
  setInspGenByType,
  inspirationListExpanded,
  setInspirationListExpanded,
  setInspirationBusy,
  setInspirationErr,
  setInspirationIndex,
  setStatus
}: InspirationTabProps) {
  return (
    <div className="navGlobalScroll">
      <div className="auditPanel inspirationPanelFlat">
        <div className="auditPanelBody">
          {/* 顶部标题/刷新按钮移除:左侧 Tab 已是"灵感库",保持面板紧凑 */}

          <div className="browserTabsBar" role="tablist" aria-label="灵感库分类" style={{ marginTop: 0 }}>
            <div className="browserTabsStrip tabsWrap">
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "character" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "character"}
                onClick={() => {
                  setInspirationTypeTab("character");
                  setInspirationFuncByType((prev) => ({ ...prev, character: "generate" }));
                }}
                disabled={busy}
              >
                角色
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "org" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "org"}
                onClick={() => {
                  setInspirationTypeTab("org");
                  setInspirationFuncByType((prev) => ({ ...prev, org: "generate" }));
                }}
                disabled={busy}
              >
                组织
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "event" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "event"}
                onClick={() => {
                  setInspirationTypeTab("event");
                  setInspirationFuncByType((prev) => ({ ...prev, event: "generate" }));
                }}
                disabled={busy}
              >
                事件
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "place" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "place"}
                onClick={() => {
                  setInspirationTypeTab("place");
                  setInspirationFuncByType((prev) => ({ ...prev, place: "generate" }));
                }}
                disabled={busy}
              >
                地点
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "item" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "item"}
                onClick={() => {
                  setInspirationTypeTab("item");
                  setInspirationFuncByType((prev) => ({ ...prev, item: "generate" }));
                }}
                disabled={busy}
              >
                道具
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "technique" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "technique"}
                onClick={() => {
                  setInspirationTypeTab("technique");
                  setInspirationFuncByType((prev) => ({ ...prev, technique: "generate" }));
                }}
                disabled={busy}
              >
                功法
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationTypeTab === "lore" ? "active" : ""}`}
                aria-selected={inspirationTypeTab === "lore"}
                onClick={() => {
                  setInspirationTypeTab("lore");
                  setInspirationFuncByType((prev) => ({ ...prev, lore: "generate" }));
                }}
                disabled={busy}
              >
                秘闻
              </button>
            </div>
          </div>

          <div className="browserTabsBar" role="tablist" aria-label="灵感库功能" style={{ marginTop: 0 }}>
            <div className="browserTabsStrip tabsWrap">
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationFuncTab === "generate" ? "active" : ""}`}
                aria-selected={inspirationFuncTab === "generate"}
                onClick={() =>
                  setInspirationFuncByType((prev) => ({
                    ...prev,
                    [inspirationTypeTab]: "generate"
                  }))
                }
                disabled={busy}
              >
                生成
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationFuncTab === "list" ? "active" : ""}`}
                aria-selected={inspirationFuncTab === "list"}
                onClick={() =>
                  setInspirationFuncByType((prev) => ({
                    ...prev,
                    [inspirationTypeTab]: "list"
                  }))
                }
                disabled={busy}
              >
                列表
              </button>
              <button
                type="button"
                role="tab"
                className={`browserTab tabCompact ${inspirationFuncTab === "recycle" ? "active" : ""}`}
                aria-selected={inspirationFuncTab === "recycle"}
                onClick={() =>
                  setInspirationFuncByType((prev) => ({
                    ...prev,
                    [inspirationTypeTab]: "recycle"
                  }))
                }
                disabled={busy}
              >
                回收站
              </button>
            </div>
          </div>

          {inspirationErr ? (
            <div className="auditErrorBox" style={{ marginTop: 10 }}>
              <div className="auditErrorTitle">灵感库加载失败</div>
              <div className="auditErrorMsg">{inspirationErr}</div>
            </div>
          ) : null}

          {(() => {
            const idx = inspirationIndex;
            const all: IdeaItem[] = Array.isArray(idx?.items) ? (idx!.items as any) : [];
            const q = "";

            const typeMatch = (it: IdeaItem) => {
              const subtype = String((it as any)?.subtype || "").trim();
              if (inspirationTypeTab === "character")
                return subtype === "character" || it.type === "naming";
              if (inspirationTypeTab === "place") return subtype === "place";
              if (inspirationTypeTab === "org") return subtype === "organization";
              if (inspirationTypeTab === "item") return subtype === "item";
              if (inspirationTypeTab === "event") return subtype === "event";
              if (inspirationTypeTab === "lore") return subtype === "lore";
              if (inspirationTypeTab === "technique") return subtype === "technique";
              return true;
            };

            const statusMatch = (it: IdeaItem) => {
              if (inspirationFilter === "pinned") return Boolean(it.pinned) && it.status !== "deleted";
              return inspirationFuncTab === "recycle" ? it.status === "deleted" : it.status !== "deleted";
            };

            const searchMatch = (it: IdeaItem) => {
              if (!q) return true;
              const title = String(it.title || "");
              const content = String(it.content || "");
              const tags = Array.isArray(it.tags) ? it.tags.join(" ") : "";
              return `${title} ${content} ${tags}`.toLowerCase().includes(q);
            };

            const filtered = all.filter(typeMatch).filter(statusMatch).filter(searchMatch);

            const kindForUi =
              inspirationTypeTab === "character"
                ? ("character" as const)
                : inspirationTypeTab === "place"
                  ? ("place" as const)
                  : inspirationTypeTab === "org"
                    ? ("org" as const)
                    : inspirationTypeTab === "item"
                      ? ("item" as const)
                      : inspirationTypeTab === "event"
                        ? ("event" as const)
                        : inspirationTypeTab === "lore"
                          ? ("lore" as const)
                          : inspirationTypeTab === "technique"
                            ? ("technique" as const)
                            : ("character" as const);

            const inspKey = inspirationTypeTab;
            const genSlice = inspGenByType[inspKey];

            return (
              <>
                {inspirationFuncTab === "generate" ? (
                  <div className="timelineSection" style={{ marginTop: 12 }}>
                    <div className="auditPanelTitle">生成</div>
                    <div
                      className="row"
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "nowrap",
                        justifyContent: "flex-start"
                      }}
                    >
                      {/* 生成类型由上方内容页签决定;这里不再提供下拉框 */}

                      <label className="toggle timelineToggle" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={genSlice.useMemory}
                          onChange={(e) =>
                            setInspGenByType((prev) => ({
                              ...prev,
                              [inspKey]: { ...prev[inspKey], useMemory: e.target.checked }
                            }))
                          }
                          disabled={busy || inspirationBusy}
                        />
                        参考全书记忆
                      </label>

                      <span className="muted" style={{ whiteSpace: "nowrap" }}>
                        数量
                      </span>
                      <input
                        className="timelineInput"
                        value={String(genSlice.count)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value || "3", 10);
                          if (!Number.isFinite(n)) return;
                          setInspGenByType((prev) => ({
                            ...prev,
                            [inspKey]: { ...prev[inspKey], count: clamp(n, 1, 10) }
                          }));
                        }}
                        inputMode="numeric"
                        disabled={busy || inspirationBusy}
                        style={{ width: 70, height: 28, padding: "4px 10px", lineHeight: "18px" }}
                      />

                      <button
                        type="button"
                        className="btnSquare btnCompact"
                        disabled={busy || inspirationBusy || !activeBook}
                        onClick={async () => {
                          if (!activeBook) return;
                          const previewBucket = inspKey;
                          const snap = inspGenByType[previewBucket];
                          setInspirationBusy(true);
                          setInspirationErr("");
                          try {
                            const { items, debug } = await generateInspirationPreview(activeBook, {
                              modelConfigId: activeModelId,
                              kind: kindForUi as any,
                              count: clamp(snap.count, 1, 10),
                              useMemory: snap.useMemory,
                              options: {},
                              freeText: snap.freeText,
                              itemOwnerCharacterName:
                                kindForUi === "item" || kindForUi === "technique"
                                  ? snap.itemOwnerCharacterName.trim() || undefined
                                  : undefined
                            });
                            try {
                              console.groupCollapsed(
                                `[灵感库] 生成 preview kind=${String(kindForUi)} count=${clamp(snap.count, 1, 10)}`
                              );
                              if (debug?.prompt) console.log("[prompt]\n" + debug.prompt);
                              if (debug?.rawText) console.log("[raw]\n" + debug.rawText);
                              console.log("[parsed items]", items);
                              console.groupEnd();
                            } catch {}
                            setInspGenByType((prev) => ({
                              ...prev,
                              [previewBucket]: {
                                ...prev[previewBucket],
                                previewItems: items,
                                savedIdSet: {}
                              }
                            }));
                            setStatus("已生成(未保存)。");
                          } catch (e: any) {
                            setInspirationErr(e?.message || String(e));
                          } finally {
                            setInspirationBusy(false);
                          }
                        }}
                        title="调用模型生成并保存"
                      >
                        {inspirationBusy ? "生成中..." : "生成"}
                      </button>

                      {genSlice.previewItems.length ? (
                        <button
                          type="button"
                          className="btnSquare btnCompact"
                          disabled={busy || inspirationBusy}
                          onClick={() => {
                            setInspGenByType((prev) => ({
                              ...prev,
                              [inspKey]: {
                                ...prev[inspKey],
                                previewItems: [],
                                savedIdSet: {},
                                expanded: {},
                                editingId: null,
                                editTitle: "",
                                editContent: ""
                              }
                            }));
                            setStatus("已清空本次生成结果(不影响已保存)。");
                          }}
                          title="仅清空本次类型的生成预览"
                        >
                          清空
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
                        padding: 8,
                        background: "transparent"
                      }}
                    >
                      {kindForUi === "item" || kindForUi === "technique" ? (
                        <div
                          className="row"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                            flexWrap: "wrap"
                          }}
                        >
                          <span className="muted" style={{ whiteSpace: "nowrap" }}>
                            持有人
                          </span>
                          <select
                            className="timelineInput"
                            value={genSlice.itemOwnerCharacterName}
                            onChange={(e) =>
                              setInspGenByType((prev) => ({
                                ...prev,
                                [inspKey]: { ...prev[inspKey], itemOwnerCharacterName: e.target.value }
                              }))
                            }
                            disabled={busy || inspirationBusy}
                            style={{ flex: 1, minWidth: 160, height: 32 }}
                          >
                            <option value="">
                              无主 / 待定归属(先收灵感,后可分配给角色)
                            </option>
                            {(() => {
                              const auditIdx = auditCharactersIndex as {
                                characters?: unknown[];
                                hiddenNames?: unknown[];
                              } | null;
                              const all = Array.isArray(auditIdx?.characters)
                                ? (auditIdx!.characters as any[])
                                : [];
                              const hiddenSet = new Set(
                                Array.isArray(auditIdx?.hiddenNames)
                                  ? (auditIdx!.hiddenNames as any[]).map((x) => String(x))
                                  : []
                              );
                              const names = Array.from(
                                new Set(
                                  all
                                    .map((c) => String(c?.name || "").trim())
                                    .filter((n) => n && !hiddenSet.has(n))
                                )
                              ).sort();
                              return names.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                      ) : null}
                      <textarea
                        className="auditTextarea"
                        value={genSlice.freeText}
                        onChange={(e) =>
                          setInspGenByType((prev) => ({
                            ...prev,
                            [inspKey]: { ...prev[inspKey], freeText: e.target.value }
                          }))
                        }
                        placeholder={
                          inspirationTypeTab === "place"
                            ? "自由输入(可选):如:一个适合藏匿赃物、充满霉味的废弃杂役仓"
                            : inspirationTypeTab === "item"
                              ? "自由输入(可选):如:偏邪道、与某事件证物相关、代价偏重..."
                              : inspirationTypeTab === "org"
                                ? "自由输入(可选):如:偏谍报与渗透、与当权者对立、内部派系倾轧严重..."
                                : inspirationTypeTab === "event"
                                  ? "自由输入(可选):如:逼主角二选一、连锁因果、要改业力账本..."
                                  : inspirationTypeTab === "lore"
                                    ? "自由输入(可选):如:宗门丑闻、被掩盖的历史、禁忌知识..."
                                    : inspirationTypeTab === "technique"
                                      ? "自由输入(可选):如:高反噬邪功、需特殊心境、与某段血史相关..."
                                      : "自由输入(可选):例如「更阴谋一点」「不要低俗」「与主角表面盟友、暗藏私心」..."
                        }
                        disabled={busy || inspirationBusy}
                        style={{ marginTop: 0, minHeight: 70 }}
                      />
                    </div>

                    {genSlice.previewItems.length ? (
                      <div className="timelineSection" style={{ marginTop: 10 }}>
                        <div className="auditPanelTitle">生成结果(点保存后进入列表)</div>
                        <div className="timelineRangeList">
                          {genSlice.previewItems.map((it, idx) => {
                            const key = it.id || String(idx);
                            const saved = Boolean(genSlice.savedIdSet[key]);
                            const title = String(it.title || "").trim();
                            const content = String(it.content || "").trim();
                            const placeParsed =
                              kindForUi === "place" ? parseInspirationPlaceContent(content) : null;
                            const itemParsed =
                              kindForUi === "item" ? parseInspirationItemContent(content) : null;
                            const orgParsed =
                              kindForUi === "org" ? parseInspirationOrgContent(content) : null;
                            const eventParsed =
                              kindForUi === "event" ? parseInspirationEventContent(content) : null;
                            const loreParsed =
                              kindForUi === "lore" ? parseInspirationLoreContent(content) : null;
                            const techniqueParsed =
                              kindForUi === "technique"
                                ? parseInspirationTechniqueContent(content)
                                : null;
                            const expanded = Boolean(genSlice.expanded[key]);
                            const editing = genSlice.editingId === key;
                            return (
                              <div key={key} className="timelineRangeItem">
                                <div className="timelineRangeTop" style={{ gap: 8, flexWrap: "wrap" }}>
                                  <div className="timelineRangeTitle" style={{ flex: 1, minWidth: 120 }}>
                                    {title || "(生成内容)"}
                                  </div>
                                  <button
                                    type="button"
                                    className="btnSort"
                                    disabled={busy}
                                    onClick={() =>
                                      setInspGenByType((prev) => {
                                        const s = prev[inspKey];
                                        return {
                                          ...prev,
                                          [inspKey]: {
                                            ...s,
                                            expanded: { ...s.expanded, [key]: !s.expanded[key] }
                                          }
                                        };
                                      })
                                    }
                                  >
                                    {expanded ? "收起" : "展开"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btnSort"
                                    disabled={busy || inspirationBusy}
                                    onClick={() => {
                                      if (!editing) {
                                        setInspGenByType((prev) => {
                                          const s = prev[inspKey];
                                          return {
                                            ...prev,
                                            [inspKey]: {
                                              ...s,
                                              editingId: key,
                                              editTitle: title,
                                              editContent: content,
                                              expanded: { ...s.expanded, [key]: true }
                                            }
                                          };
                                        });
                                      } else {
                                        setInspGenByType((prev) => ({
                                          ...prev,
                                          [inspKey]: { ...prev[inspKey], editingId: null }
                                        }));
                                      }
                                    }}
                                    title="编辑生成内容"
                                  >
                                    {editing ? "取消编辑" : "编辑"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btnSort"
                                    disabled={busy || inspirationBusy || saved || !activeBook}
                                    onClick={async () => {
                                      if (!activeBook) return;
                                      setInspirationBusy(true);
                                      setInspirationErr("");
                                      try {
                                        const finalTitle = (editing ? genSlice.editTitle : title).trim();
                                        const finalContent = (editing ? genSlice.editContent : content).trim();
                                        if (!finalContent) {
                                          setInspirationErr("内容不能为空。");
                                          return;
                                        }
                                        const baseMeta =
                                          (it as any).meta && typeof (it as any).meta === "object"
                                            ? { ...(it as any).meta }
                                            : {};
                                        if (inspirationTypeTab === "item" || inspirationTypeTab === "technique") {
                                          const own = genSlice.itemOwnerCharacterName.trim();
                                          baseMeta.itemOwnerMode = own ? "bound" : "floating";
                                          if (own) baseMeta.itemOwnerCharacterName = own;
                                          else delete baseMeta.itemOwnerCharacterName;
                                        }
                                        const { index } = await upsertInspirationItem(activeBook, {
                                          type: "generation",
                                          subtype:
                                            inspirationTypeTab === "character"
                                              ? "character"
                                              : inspirationTypeTab === "place"
                                                ? "place"
                                                : inspirationTypeTab === "org"
                                                  ? "organization"
                                                  : inspirationTypeTab === "item"
                                                    ? "item"
                                                    : inspirationTypeTab === "event"
                                                      ? "event"
                                                      : inspirationTypeTab === "lore"
                                                        ? "lore"
                                                        : inspirationTypeTab === "technique"
                                                          ? "technique"
                                                          : it.subtype,
                                          title: finalTitle || undefined,
                                          content: finalContent,
                                          tags: Array.isArray((it as any).tags) ? (it as any).tags : undefined,
                                          status: "active",
                                          meta: Object.keys(baseMeta).length ? baseMeta : undefined
                                        });
                                        setInspirationIndex(index);
                                        setInspGenByType((prev) => {
                                          const s = prev[inspKey];
                                          return {
                                            ...prev,
                                            [inspKey]: {
                                              ...s,
                                              savedIdSet: { ...s.savedIdSet, [key]: true }
                                            }
                                          };
                                        });
                                        setStatus("已保存到列表。");
                                      } catch (e: any) {
                                        setInspirationErr(e?.message || String(e));
                                      } finally {
                                        setInspirationBusy(false);
                                      }
                                    }}
                                    title="保存后才会出现在列表页"
                                  >
                                    {saved ? "已保存" : "保存"}
                                  </button>
                                </div>
                                {editing ? (
                                  <div style={{ marginTop: 8 }}>
                                    <input
                                      className="auditRelationsSearch"
                                      value={genSlice.editTitle}
                                      onChange={(e) =>
                                        setInspGenByType((prev) => ({
                                          ...prev,
                                          [inspKey]: { ...prev[inspKey], editTitle: e.target.value }
                                        }))
                                      }
                                      placeholder={
                                        kindForUi === "place"
                                          ? "标题:地点名"
                                          : kindForUi === "item"
                                            ? "标题:道具名"
                                            : kindForUi === "org"
                                              ? "标题:组织或势力名"
                                              : kindForUi === "event"
                                                ? "标题:事件名"
                                                : kindForUi === "lore"
                                                  ? "标题:秘闻标题"
                                                  : kindForUi === "technique"
                                                    ? "标题:功法名"
                                                    : "标题(角色名等)"
                                      }
                                      disabled={busy || inspirationBusy}
                                    />
                                    <textarea
                                      className="auditTextarea"
                                      value={genSlice.editContent}
                                      onChange={(e) =>
                                        setInspGenByType((prev) => ({
                                          ...prev,
                                          [inspKey]: { ...prev[inspKey], editContent: e.target.value }
                                        }))
                                      }
                                      placeholder={
                                        kindForUi === "place" ||
                                        kindForUi === "item" ||
                                        kindForUi === "org" ||
                                        kindForUi === "event" ||
                                        kindForUi === "lore" ||
                                        kindForUi === "technique"
                                          ? "正文:结构化卡片为 JSON,编辑后请保持可解析"
                                          : "正文内容"
                                      }
                                      disabled={busy || inspirationBusy}
                                      style={{ marginTop: 8, minHeight: 140 }}
                                    />
                                  </div>
                                ) : expanded ? (
                                  placeParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationPlaceStructuredView data={placeParsed} />
                                    </div>
                                  ) : itemParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationItemStructuredView data={itemParsed} />
                                    </div>
                                  ) : orgParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationOrgStructuredView data={orgParsed} />
                                    </div>
                                  ) : eventParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationEventStructuredView data={eventParsed} />
                                    </div>
                                  ) : loreParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationLoreStructuredView data={loreParsed} />
                                    </div>
                                  ) : techniqueParsed ? (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                      <InspirationTechniqueStructuredView data={techniqueParsed} />
                                    </div>
                                  ) : (
                                    <div className="timelineRangeSummary" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                                      {content}
                                    </div>
                                  )
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div
                  className="timelineSection"
                  style={{
                    marginTop: 12,
                    display: inspirationFuncTab === "list" || inspirationFuncTab === "recycle" ? undefined : "none"
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="auditPanelTitle">
                      {inspirationFuncTab === "recycle" ? "回收站" : inspirationFilter === "pinned" ? "收藏" : "列表"}
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {filtered.length} 条
                      </span>
                    </div>
                    {inspirationFuncTab === "recycle" ? (
                      <button
                        type="button"
                        className="btnSquare"
                        disabled={busy || inspirationBusy || !activeBook}
                        onClick={async () => {
                          if (!activeBook) return;
                          const ok = await appConfirm({
                            message: "确认清空回收站?(彻底删除不可恢复)",
                            variant: "danger"
                          });
                          if (!ok) return;
                          setInspirationBusy(true);
                          setInspirationErr("");
                          try {
                            const { index, purged } = await purgeInspirationDeleted(activeBook);
                            setInspirationIndex(index);
                            setStatus(`已清空回收站:删除 ${purged} 条。`);
                          } catch (e: any) {
                            setInspirationErr(e?.message || String(e));
                          } finally {
                            setInspirationBusy(false);
                          }
                        }}
                      >
                        清空回收站
                      </button>
                    ) : null}
                  </div>

                  {!filtered.length ? (
                    <div className="muted auditPanelEmpty">暂无内容。</div>
                  ) : (
                    <div className="timelineRangeList">
                      {filtered.map((it) => {
                        const title = String(it.title || "").trim();
                        const tags = Array.isArray(it.tags) ? it.tags : [];
                        const content = String(it.content || "").trim();
                        const itemOwnerSaved =
                          (it.subtype === "item" || it.subtype === "technique") &&
                          (it as any).meta &&
                          typeof (it as any).meta === "object"
                            ? String((it as any).meta.itemOwnerCharacterName || "").trim()
                            : "";
                        const placeParsed =
                          it.subtype === "place" ? parseInspirationPlaceContent(content) : null;
                        const itemParsed =
                          it.subtype === "item" ? parseInspirationItemContent(content) : null;
                        const orgParsed =
                          it.subtype === "organization"
                            ? parseInspirationOrgContent(content)
                            : null;
                        const eventParsed =
                          it.subtype === "event" ? parseInspirationEventContent(content) : null;
                        const loreParsed =
                          it.subtype === "lore" ? parseInspirationLoreContent(content) : null;
                        const techniqueParsed =
                          it.subtype === "technique"
                            ? parseInspirationTechniqueContent(content)
                            : null;
                        const expanded = Boolean(inspirationListExpanded[it.id]);
                        return (
                          <div key={it.id} className="timelineRangeItem">
                            <div className="timelineRangeTop" style={{ gap: 8, flexWrap: "wrap" }}>
                              <div className="timelineRangeTitle" style={{ flex: 1, minWidth: 120 }}>
                                {title || (it.type === "naming" ? "(名字)" : "(灵感)")}
                                {itemOwnerSaved ? (
                                  <span className="muted"> · 持有:{itemOwnerSaved}</span>
                                ) : null}
                                {it.subtype ? <span className="muted"> · {it.subtype}</span> : null}
                              </div>
                              <button
                                type="button"
                                className="btnSort"
                                disabled={busy}
                                onClick={() =>
                                  setInspirationListExpanded((prev) => ({ ...prev, [it.id]: !prev[it.id] }))
                                }
                              >
                                {expanded ? "收起" : "展开"}
                              </button>
                              <button
                                type="button"
                                className="btnSort"
                                disabled={busy}
                                onClick={async () => {
                                  if (!activeBook) return;
                                  const ok = await appConfirm({
                                    message: "确认移到回收站?(可在回收站恢复)"
                                  });
                                  if (!ok) return;
                                  setInspirationBusy(true);
                                  setInspirationErr("");
                                  try {
                                    const { index } = await setInspirationItemStatus(activeBook, {
                                      id: it.id,
                                      status: "deleted"
                                    });
                                    setInspirationIndex(index);
                                    setStatus("已移到回收站。");
                                  } catch (e: any) {
                                    setInspirationErr(e?.message || String(e));
                                  } finally {
                                    setInspirationBusy(false);
                                  }
                                }}
                                style={{ display: inspirationFuncTab === "recycle" ? "none" : undefined }}
                              >
                                移到回收站
                              </button>
                        {inspirationFuncTab === "recycle" ? (
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || !activeBook}
                            onClick={async () => {
                              if (!activeBook) return;
                              setInspirationBusy(true);
                              setInspirationErr("");
                              try {
                                const { index } = await setInspirationItemStatus(activeBook, {
                                  id: it.id,
                                  status: "active"
                                });
                                setInspirationIndex(index);
                                setStatus("已恢复。");
                              } catch (e: any) {
                                setInspirationErr(e?.message || String(e));
                              } finally {
                                setInspirationBusy(false);
                              }
                            }}
                            title="恢复到列表页"
                          >
                            恢复
                          </button>
                        ) : null}
                            </div>

                            {tags.length ? (
                              <div className="muted timelineSuggestionWhy" style={{ marginTop: 4 }}>
                                {tags.join(" · ")}
                              </div>
                            ) : null}

                            {expanded ? (
                              placeParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationPlaceStructuredView data={placeParsed} />
                                </div>
                              ) : itemParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationItemStructuredView data={itemParsed} />
                                </div>
                              ) : orgParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationOrgStructuredView data={orgParsed} />
                                </div>
                              ) : eventParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationEventStructuredView data={eventParsed} />
                                </div>
                              ) : loreParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationLoreStructuredView data={loreParsed} />
                                </div>
                              ) : techniqueParsed ? (
                                <div className="timelineRangeSummary" style={{ marginTop: 6 }}>
                                  <InspirationTechniqueStructuredView data={techniqueParsed} />
                                </div>
                              ) : (
                                <div className="timelineRangeSummary" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                                  {content}
                                </div>
                              )
                            ) : (
                              <div className="timelineRangeSummary memoryClamp2" style={{ marginTop: 6 }}>
                                {placeParsed
                                  ? inspirationPlaceCollapsedBlurb(placeParsed, title)
                                  : itemParsed
                                    ? inspirationItemCollapsedBlurb(itemParsed, title)
                                    : orgParsed
                                      ? inspirationOrgCollapsedBlurb(orgParsed, title)
                                      : eventParsed
                                        ? inspirationEventCollapsedBlurb(eventParsed, title)
                                        : loreParsed
                                          ? inspirationLoreCollapsedBlurb(loreParsed, title)
                                          : techniqueParsed
                                            ? inspirationTechniqueCollapsedBlurb(techniqueParsed, title)
                                            : content}
                              </div>
                            )}

                            {/* 列表变体功能已按需求移除 */}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
